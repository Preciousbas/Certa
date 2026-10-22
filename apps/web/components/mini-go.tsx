"use client";

import { useTelegramMainButton } from "./telegram";

export function MiniGo({ href, label }: { href: string; label: string }) {
  useTelegramMainButton(label, () => {
    window.location.href = href;
  }, true);
  return (
    <a className="ui-btn ui-btn-primary" href={href}>
      {label}
    </a>
  );
}
