"use client";

import { useEffect, useState } from "react";

type Chip = { id: string; name: string; status: string; progress: number; retry?: boolean };

function requestHeaders(): Headers {
  const headers = new Headers();
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) headers.set("authorization", `tma ${initData}`);
  const csrf = document.cookie.split("; ").find((row) => row.startsWith("certa_csrf="))?.split("=")[1];
  if (csrf) headers.set("x-csrf-token", decodeURIComponent(csrf));
  return headers;
}

export default function DocumentsPage() {
  const [files, setFiles] = useState<Chip[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [retryId, setRetryId] = useState<string | null>(null);

  async function loadSaved(): Promise<boolean> {
    const projectId = window.location.pathname.split("/").at(3) ?? "";
    const response = await fetch(`/api/projects/${projectId}/documents`, { headers: requestHeaders() });
    if (!response.ok) return false;
    const body = (await response.json()) as { documents?: Chip[] };
    if (!body.documents) return false;
    setFiles((current) => {
      if (body.documents!.length === 0 && current.length > 0) return current;
      return body.documents!;
    });
    const retryable = body.documents.find((row) => row.retry || row.status === "Failed" || row.status === "Reading");
    if (body.documents.length > 0) setRetryId(retryable?.id ?? null);
    return body.documents.length > 0;
  }

  useEffect(() => {
    const load = () => {
      void loadSaved();
    };
    load();
    window.addEventListener("certa-telegram-ready", load);
    return () => window.removeEventListener("certa-telegram-ready", load);
  }, []);

  async function retry() {
    if (!retryId) return;
    const projectId = window.location.pathname.split("/").at(3) ?? "";
    const headers = requestHeaders();
    setFiles((current) => current.map((row) => (row.id === retryId ? { ...row, status: "Reading", progress: 45 } : row)));
    const response = await fetch(`/api/projects/${projectId}/documents/${retryId}/complete`, { method: "POST", headers });
    const body = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(body.message ?? "I couldn't read that file. Tap Retry to try again.");
      setFiles((current) => current.map((row) => (row.status === "Reading" ? { ...row, status: "Failed", progress: 100 } : row)));
      return;
    }
    setMessage(null);
    setRetryId(null);
    setFiles((current) => current.map((row) => (row.status === "Reading" ? { ...row, status: "Read", progress: 100 } : row)));
  }

  async function upload(list: FileList | File[]) {
    const projectId = window.location.pathname.split("/").at(3) ?? "";
    const headers = requestHeaders();
    for (const file of Array.from(list)) {
      if (!/\.(pdf|docx|xlsx|xls|csv|jpe?g|png|heic|heif)$/i.test(file.name)) {
        setMessage("Please send a PDF, Word, Excel or CSV file, or a clear photo of each page.");
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        setMessage("This file is bigger than 20 MB.");
        continue;
      }
      setFiles((current) => [...current, { id: `local-${file.name}`, name: file.name, status: "Uploaded", progress: 10 }]);
      try {
        const issued = await fetch(`/api/projects/${projectId}/documents/upload-url`, {
          method: "POST",
          headers: { ...Object.fromEntries(headers), "content-type": "application/json" },
          body: JSON.stringify({ fileName: file.name, size: file.size }),
        });
        const ticket = (await issued.json()) as { uploadUrl?: string; documentId?: string; message?: string };
        if (!issued.ok || !ticket.uploadUrl || !ticket.documentId) {
          setMessage(ticket.message ?? "Upload failed: the connection dropped. Your file wasn't saved. Try again.");
          continue;
        }
        setFiles((current) => current.map((row) => (row.name === file.name ? { ...row, progress: 45, status: "Reading" } : row)));
        const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
        if (!put.ok) {
          setMessage("Upload failed: the connection dropped. Your file wasn't saved. Try again.");
          continue;
        }
        const done = await fetch(`/api/projects/${projectId}/documents/${ticket.documentId}/complete`, { method: "POST", headers });
        const body = (await done.json()) as { message?: string };
        if (!done.ok) {
          const note = body.message ?? "Upload failed: the connection dropped. Your file wasn't saved. Try again.";
          setMessage(note);
          const shown = await loadSaved();
          if (!shown) {
            const duplicate = note.startsWith("You've already uploaded");
            setFiles((current) => current.map((row) => (row.name === file.name ? { ...row, progress: 100, status: duplicate ? "Already uploaded" : "Failed" } : row)));
            setRetryId(duplicate ? null : ticket.documentId);
          }
          continue;
        }
        setFiles((current) => current.map((row) => (row.name === file.name ? { ...row, progress: 100, status: "Read" } : row)));
        const shown = await loadSaved();
        if (!shown) setRetryId(null);
      } catch {
        setMessage("Upload failed: the connection dropped. Your file wasn't saved. Try again.");
      }
    }
  }

  return (
    <div>
      <p className="eyebrow">Documents</p>
      <h1>Upload the contract</h1>
      <form
        onSubmit={(event) => event.preventDefault()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (event.dataTransfer.files.length > 0) void upload(event.dataTransfer.files);
        }}
      >
        <label className="card" style={{ display: "block", cursor: "pointer" }}>
          Drop your contract, BoQ or payment schedule here, or <strong>choose files</strong>. PDF, Word, Excel, CSV or photos. Up to 20 MB each, 10 files.
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.heic,.heif"
            style={{ display: "block", marginTop: 12 }}
            onChange={(event) => {
              if (event.target.files) void upload(event.target.files);
            }}
          />
        </label>
      </form>
      {files.length === 0 ? (
        <p className="muted">No documents yet. Upload the signed contract and the priced BoQ — Certa will read every figure from them.</p>
      ) : (
        <ul className="plain">
          {files.map((file) => (
            <li key={file.id}>
              {file.name}
              <div style={{ height: 6, background: "var(--border)", marginTop: 6 }}>
                <div style={{ width: `${file.progress}%`, height: 6, background: "var(--action)" }} />
              </div>
              <span className="faint">{file.status}</span>
            </li>
          ))}
        </ul>
      )}
      {message ? <p className="toast">{message}</p> : null}
      {retryId ? (
        <button className="ui-btn ui-btn-secondary" type="button" onClick={() => void retry()}>
          Retry
        </button>
      ) : null}
      <p className="muted">You can extract figures once the file has been read.</p>
    </div>
  );
}
