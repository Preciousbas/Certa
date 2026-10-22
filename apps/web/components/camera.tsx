"use client";

import { useEffect, useRef, useState } from "react";
import { C1, C2, C8, poorAccuracy } from "../../../src/lib/captureMessages";

type Props = {
  projectId: string;
  stageId: string;
  stageName: string;
  stageNumber: number;
  criteria: string[];
  botUsername: string;
};

type Shot = { id: string; kept: boolean };

type Queued = {
  id: string;
  stageId: string;
  projectId: string;
  nonce: string;
  expiresAt: number;
  blob: Blob;
  capturedAt: number;
  lat: number;
  lng: number;
  accuracy: number;
  deviceInfo: string;
  attempts: number;
};

const DB_NAME = "certa-capture";
const QUEUE = "queue";
const SESSION = "session";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SESSION)) db.createObjectStore(SESSION, { keyPath: "stageId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("queue"));
  });
}

async function idbPut(store: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("queue"));
  });
}

async function idbAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error("queue"));
  });
}

async function idbDelete(store: string, key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("queue"));
  });
}

export function CaptureCamera({ projectId, stageId, stageName, stageNumber, criteria, botUsername }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("Opening the camera.");
  const [nonce, setNonce] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const nonceRef = useRef("");
  const expiresRef = useRef(0);

  function authHeaders(): Headers {
    const headers = new Headers();
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) headers.set("authorization", `tma ${initData}`);
    return headers;
  }

  async function rememberNonce(value: string, expiresAt: string) {
    nonceRef.current = value;
    expiresRef.current = Date.parse(expiresAt);
    setNonce(value);
    await idbPut(SESSION, { stageId, nonce: value, expiresAt: expiresRef.current, projectId });
  }

  async function uploadQueued(item: Queued): Promise<boolean> {
    if (!navigator.onLine) return false;
    const body = new FormData();
    body.set("photo", item.blob, "capture.jpg");
    body.set("nonce", item.nonce);
    body.set("projectId", item.projectId);
    body.set("stageId", item.stageId);
    body.set("capturedAt", String(item.capturedAt));
    body.set("lat", String(item.lat));
    body.set("lng", String(item.lng));
    body.set("accuracy", String(item.accuracy));
    body.set("deviceInfo", item.deviceInfo);
    const response = await fetch("/api/mini/capture", { method: "POST", headers: authHeaders(), body });
    const result = (await response.json()) as { message?: string; accepted?: boolean; photoId?: string };
    if (result.accepted && result.photoId) {
      await idbDelete(QUEUE, item.id);
      setShots((current) => current.some((shot) => shot.id === result.photoId) ? current : [...current, { id: result.photoId!, kept: true }]);
      setMessage(result.message ?? "Photo kept.");
      return true;
    }
    setMessage(result.message ?? "This photo was refused.");
    await idbDelete(QUEUE, item.id);
    return false;
  }

  const flushing = useRef(false);

  async function flush() {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const rows = (await idbAll<Queued>(QUEUE)).filter((row) => row.stageId === stageId && row.expiresAt > Date.now());
      for (const row of rows) {
        try {
          const ok = await uploadQueued(row);
          if (!ok && !navigator.onLine) return;
        } catch {
          const next = { ...row, attempts: row.attempts + 1 };
          await idbPut(QUEUE, next);
          window.setTimeout(() => void flush(), Math.min(30_000, 1000 * 2 ** next.attempts));
          return;
        }
      }
    } finally {
      flushing.current = false;
    }
  }

  useEffect(() => {
    let stream: MediaStream | null = null;
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    void (async () => {
      const sessions = await idbAll<{ stageId: string; nonce: string; expiresAt: number }>(SESSION);
      const saved = sessions.find((row) => row.stageId === stageId && row.expiresAt > Date.now());
      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) {
        setMessage("Open this page from Telegram so the photos are tied to your account.");
        return;
      }
      if (saved) {
        nonceRef.current = saved.nonce;
        expiresRef.current = saved.expiresAt;
        setNonce(saved.nonce);
      } else {
        const response = await fetch("/api/mini/nonce", {
          method: "POST",
          headers: { ...Object.fromEntries(authHeaders()), "content-type": "application/json" },
          body: JSON.stringify({ projectId, stageId }),
        });
        const body = (await response.json()) as { nonce?: string; expiresAt?: string; message?: string };
        if (!body.nonce || !body.expiresAt) {
          setMessage(body.message ?? "The camera could not be opened for this stage.");
          return;
        }
        await rememberNonce(body.nonce, body.expiresAt);
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 } },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setMessage("Take the photos here. Gallery uploads are not accepted.");
      } catch {
        setMessage(C1);
      }
      await flush();
    })();
    return () => {
      window.removeEventListener("online", onOnline);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [projectId, stageId]);

  async function shoot() {
    const video = videoRef.current;
    if (!video || !nonceRef.current) return;
    if (shots.length >= 8) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(C1);
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (!blob) throw new Error(C1);
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error(C2));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error(C2)), {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
      const accuracy = Math.round(position.coords.accuracy);
      if (accuracy > 50) {
        setMessage(poorAccuracy(accuracy));
        return;
      }
      const item: Queued = {
        id: crypto.randomUUID(),
        stageId,
        projectId,
        nonce: nonceRef.current,
        expiresAt: expiresRef.current,
        blob,
        capturedAt: Date.now(),
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy,
        deviceInfo: navigator.userAgent.slice(0, 180),
        attempts: 0,
      };
      if (!navigator.onLine) {
        await idbPut(QUEUE, item);
        setMessage(C8);
        return;
      }
      await idbPut(QUEUE, item);
      await uploadQueued(item);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : C1);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (shots.length < 3 || sending) return;
    setSending(true);
    try {
      const response = await fetch("/api/mini/submission", {
        method: "POST",
        headers: { ...Object.fromEntries(authHeaders()), "content-type": "application/json" },
        body: JSON.stringify({ projectId, stageId, nonce: nonceRef.current }),
      });
      const body = (await response.json()) as { message?: string };
      setMessage(body.message ?? "The photos could not be sent.");
    } catch {
      setMessage(C8);
    } finally {
      setSending(false);
    }
  }

  const guidance = criteria[shots.length] ?? criteria[0] ?? "Show the work for this stage from more than one angle.";
  const telegramHref = botUsername ? `https://t.me/${botUsername}?startapp=capture_${stageId}` : "";
  const kept = shots.length;

  return (
    <div className="capture">
      <p className="eyebrow">Photo proof · stage {stageNumber}</p>
      <h1>{stageName}</h1>
      <div className="capture-frame">
        <video ref={videoRef} autoPlay muted playsInline />
        <p className="capture-guide">{guidance}</p>
        {nonce ? <p className="capture-mark">{nonce.slice(0, 6)}</p> : null}
      </div>
      <p className="muted">{kept} of 3–8 photos kept</p>
      <button className="btn-block" type="button" disabled={busy || kept >= 8 || !nonce} onClick={() => void shoot()}>
        Take photo
      </button>
      <button className="btn-block capture-send" type="button" disabled={sending || kept < 3} onClick={() => void send()}>
        Send photos for checking
      </button>
      <p data-testid="capture-message">{message}</p>
      {telegramHref ? <a href={telegramHref}>Open in Telegram</a> : null}
    </div>
  );
}
