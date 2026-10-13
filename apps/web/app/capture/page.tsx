"use client";

import { useState } from "react";

export default function CapturePage() {
  const [message, setMessage] = useState("Open the camera. Gallery uploads are refused.");
  const [busy, setBusy] = useState(false);

  async function shoot(video: HTMLVideoElement) {
    setBusy(true);
    setMessage("Checking the photo.");
    try {
      const nonceRes = await fetch("/api/mini/nonce", { method: "POST" });
      const nonceBody = (await nonceRes.json()) as { nonce?: string; error?: string };
      if (!nonceBody.nonce) throw new Error(nonceBody.error ?? "No capture session.");
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
      body.set("capturedAt", String(Date.now()));
      if (position) {
        body.set("lat", String(position.coords.latitude));
        body.set("lng", String(position.coords.longitude));
      }
      const response = await fetch("/api/mini/capture", { method: "POST", body });
      const result = (await response.json()) as { accepted?: boolean; reasons?: string[] };
      setMessage(result.accepted ? "Photo kept. A stamped copy is on the report." : (result.reasons ?? ["Rejected."]).join(" "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The capture failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="eyebrow">Camera</p>
      <h1>Take it here. Do not pick one from the gallery.</h1>
      <video
        autoPlay
        muted
        playsInline
        ref={(node) => {
          if (!node || node.srcObject) return;
          void navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then((stream) => {
            node.srcObject = stream;
          }).catch(() => setMessage("Camera permission was refused."));
        }}
      />
      <button
        type="button"
        disabled={busy}
        style={{ marginTop: 12 }}
        onClick={(event) => {
          const video = event.currentTarget.parentElement?.querySelector("video");
          if (video) void shoot(video);
        }}
      >
        Take photo
      </button>
      <p className={message.startsWith("Photo kept") ? "toast" : "muted"}>{message}</p>
    </div>
  );
}
