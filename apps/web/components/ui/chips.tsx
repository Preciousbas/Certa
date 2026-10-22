"use client";

import { stageChip, type ChipTone } from "../../../../src/components/ui/status";
import { tooltipText, type TooltipTerm } from "../../../../src/components/ui/tooltips";
import { useId } from "react";

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: "chip-neutral",
  info: "chip-info",
  warning: "chip-warning",
  danger: "chip-danger",
  success: "chip-success",
};

export function StatusChip({ status }: { status: string }) {
  const chip = stageChip(status);
  return <span className={`chip ${TONE_CLASS[chip.tone]}`}>{chip.label}</span>;
}

export function InfoTip({ term }: { term: TooltipTerm }) {
  const id = useId();
  const text = tooltipText(term);
  return (
    <span className="info-tip">
      <button type="button" className="info-btn" aria-describedby={id} aria-label={term}>
        ⓘ
      </button>
      <span id={id} role="tooltip" className="info-pop">
        {text}
      </span>
    </span>
  );
}

export function ExplorerLink({ href }: { href: string }) {
  return (
    <a href={href}>
      Proof ↗
    </a>
  );
}

export function SourceChip({ label, href }: { label: string; href: string }) {
  return (
    <a className="source-chip" href={href}>
      {label}
    </a>
  );
}
