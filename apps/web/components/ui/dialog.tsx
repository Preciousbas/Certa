"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();
    const node = dialog;
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const focusable = node.querySelectorAll<HTMLElement>("button, a, input, select, textarea");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    node.addEventListener("keydown", trap);
    return () => node.removeEventListener("keydown", trap);
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p>{body}</p>
      <div className="actions">
        <button type="button" className="ui-btn ui-btn-primary" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="toast" role="status" aria-live="polite">
      {message}
    </p>
  );
}

export function ProjectSwitcher({
  projects,
  currentId,
}: {
  projects: { id: string; name: string }[];
  currentId: string | null;
}) {
  const [pathId, setPathId] = useState<string | null>(null);
  useEffect(() => {
    const match = window.location.pathname.match(/\/app\/p\/([^/]+)/);
    setPathId(match?.[1] ?? null);
  }, []);
  if (projects.length === 0) return null;
  const selected = pathId && projects.some((project) => project.id === pathId) ? pathId : (currentId ?? projects[0]?.id);
  return (
    <label className="switcher">
      <span className="nav-label">Project</span>
      <select
        aria-label="Switch project"
        value={selected}
        onChange={(event) => {
          window.location.href = `/app/p/${event.target.value}`;
        }}
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AppFooter({
  factory,
  factoryHref,
  supportEmail,
  fxLine,
}: {
  factory: string;
  factoryHref: string;
  supportEmail: string;
  fxLine?: string | null;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="app-footer">
      {fxLine ? <p>{fxLine}</p> : null}
      <p>
        Network: Ethereum Sepolia (test network) · Escrow factory{" "}
        <a href={factoryHref}>{factory} ↗</a>
        {supportEmail ? ` · Support: ${supportEmail}` : ""} · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
      </p>
      <p>© {year} Certa</p>
    </footer>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: { key: string; cells: ReactNode[]; card: ReactNode }[];
}) {
  return (
    <>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td key={columns[index] ?? index}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="data-cards">
        {rows.map((row) => (
          <article className="card" key={row.key}>{row.card}</article>
        ))}
      </div>
    </>
  );
}
