"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useState } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  loading = false,
  disabledReason,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const off = disabled || loading;
  return (
    <span className="btn-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        {...props}
        className={`ui-btn ui-btn-${variant}`}
        disabled={off}
        aria-disabled={off || undefined}
        aria-busy={loading || undefined}
      >
        {loading ? <span className="spinner" aria-hidden="true" /> : null}
        {loading ? <span aria-live="polite">Working…</span> : children}
      </button>
      {disabled && disabledReason && open ? <span className="reason-tip" role="tooltip">{disabledReason}</span> : null}
    </span>
  );
}

export function SegmentedToggle({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-active={value === option.value ? "true" : "false"}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  children,
}: {
  href: string;
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <a className={`ui-btn ui-btn-${variant}`} href={href}>
      {children}
    </a>
  );
}
