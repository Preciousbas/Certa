"use client";

import type { NavRole } from "../lib/labels";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type { NavRole };

type Item = { href: string; label: string; more?: boolean };

const clientItems: Item[] = [
  { href: "/", label: "Timeline" },
  { href: "/fund", label: "Fund" },
  { href: "/changes", label: "Changes" },
  { href: "/more", label: "More", more: true },
];

const consultantItems: Item[] = [
  { href: "/", label: "Timeline" },
  { href: "/stages", label: "Review" },
  { href: "/changes", label: "Changes" },
  { href: "/more", label: "More", more: true },
];

const siteItems: Item[] = [
  { href: "/", label: "Timeline" },
  { href: "/capture", label: "Camera" },
  { href: "/wallet", label: "Account" },
  { href: "/cashout", label: "Cash out" },
];

function itemsFor(role: NavRole): Item[] {
  if (role === "consultant") return consultantItems;
  if (role === "contractor" || role === "subcontractor") return siteItems;
  return clientItems;
}

export function BottomNav({ role, admin }: { role: NavRole; admin: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = itemsFor(role);
  return (
    <>
      {open ? (
        <div className="more-sheet">
          <Link href="/report" onClick={() => setOpen(false)}>Report</Link>
          <Link href="/billing" onClick={() => setOpen(false)}>Plan</Link>
          <Link href="/stages" onClick={() => setOpen(false)}>Stages</Link>
          {admin ? <Link href="/admin" onClick={() => setOpen(false)}>Desk</Link> : null}
        </div>
      ) : null}
      <nav className="bottom-nav" aria-label="Primary">
        {items.map((item) =>
          item.more ? (
            <button key={item.label} type="button" data-active={open ? "true" : "false"} onClick={() => setOpen((value) => !value)}>
              {item.label}
            </button>
          ) : (
            <Link key={item.href} href={item.href} data-active={path === item.href ? "true" : "false"}>
              {item.label}
            </Link>
          ),
        )}
      </nav>
    </>
  );
}
