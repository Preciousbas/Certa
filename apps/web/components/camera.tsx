"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTelegramMainButton } from "./telegram";

type Props = {
  projectId: string;
  stageId: string;
  stageName: string;
  stageNumber: number;
  botUsername: string;
  actionLabel: string;
  children?: ReactNode;
};

export function Camera({ projectId, stageId, stageName, stageNumber, botUsername, actionLabel, children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("Opening the camera.");
  const [blocked, setBlocked] = useState<"telegram" | "camera" | null>(null);
  const [busy, setBusy] = useState(false);

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setBlocked("camera");
      setMessage("This browser has no camera.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setBlocked(null);
      setMessage("Take it here. Gallery uploads are refused.");
    } catch {
      setBlocked("camera");
      setMessage("The camera was blocked. Allow it to take the photo here.");
    }
  }

  useEffect(() => {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setBlocked("telegram");
      setMessage("This page is outside Telegram, so the photo cannot be tied to your account.");
      return;
    }
    void openCamera();
  }, []);

  async function shoot() {
    const video = videoRef.current;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData || !video) {
      setBlocked(initData ? "camera" : "telegram");
      return;
    }
    setBusy(true);
    setMessage("Checking the photo.");
    try {
      const nonceRes = await fetch("/api/mini/nonce", {
        method: "POST",
        headers: { authorization: `tma ${initData}`, "content-type": "application/json" },
        body: JSON.stringify({ projectId, stageId }),
      });
      const nonceBody = (await nonceRes.json()) as { nonce?: string; error?: string };
      if (!nonceBody.nonce) throw new Error(nonceBody.error ?? "The capture session was refused.");
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Camera frame missing.");
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Could not read the frame.");
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 });
      }).catch(() => null);
      const body = new FormData();
      body.set("photo", blob, "capture.jpg");
      body.set("nonce", nonceBody.nonce);
      body.set("projectId", projectId);
      body.set("stageId", stageId);
      body.set("capturedAt", String(Date.now()));
      if (position) {
        body.set("lat", String(position.coords.latitude));
        body.set("lng", String(position.coords.longitude));
      }
      const response = await fetch("/api/mini/capture", { method: "POST", headers: { authorization: `tma ${initData}` }, body });
      const result = (await response.json()) as { accepted?: boolean; reasons?: string[]; error?: string };
      if (result.error) setMessage(result.error);
      else setMessage(result.accepted ? "Photo kept." : (result.reasons ?? ["The photo was refused."]).join(" "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The capture failed.");
    } finally {
      setBusy(false);
    }
  }

  const telegramHref = botUsername ? `https://t.me/${botUsername}?startapp=capture_${stageId}` : "";
  useTelegramMainButton(actionLabel, () => void shoot(), !blocked && !busy);

  return (
    <div>
      <p className="eyebrow">Photo proof · stage {stageNumber}</p>
      <h1>{stageName}</h1>
      <video ref={videoRef} autoPlay muted playsInline />
      {children}
      {blocked ? (
        <div className="card stack">
          <p>{message}</p>
          <button type="button" onClick={() => void openCamera()}>
            Allow camera
          </button>
          {telegramHref ? <a className="btn" href={telegramHref}>Open in Telegram</a> : <p className="faint">The bot link is not configured.</p>}
        </div>
      ) : (
        <button className="btn-block" type="button" disabled={busy} onClick={() => void shoot()}>
          {actionLabel}
        </button>
      )}
      {!blocked ? <p className={message.startsWith("Photo kept") ? "toast" : "muted"}>{message}</p> : null}
    </div>
  );
}
