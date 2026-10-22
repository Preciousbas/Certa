"use client";

import type { NavRole } from "../lib/labels";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

function itemsFor(role: NavRole, admin: boolean): Item[] {
  if (role === "contractor" || role === "subcontractor") {
    return [
      { href: "/", label: "Timeline" },
      { href: "/capture", label: "Camera" },
      { href: "/wallet", label: "Account" },
      { href: "/cashout", label: "Cash out" },
      { href: "/changes", label: "Changes" },
      { href: "/report", label: "Reports" },
    ];
  }
  const items: Item[] = [
    { href: "/", label: "Timeline" },
    { href: "/stages", label: role === "consultant" ? "Review" : "Stages" },
    { href: "/fund", label: "Fund" },
    { href: "/changes", label: "Changes" },
    { href: "/report", label: "Reports" },
    { href: "/billing", label: "Subscription" },
  ];
  if (admin) items.push({ href: "/admin", label: "Desk" });
  if (role === "consultant") return items.filter((item) => item.href !== "/fund");
  return items;
}

export function Sidebar({ role, admin }: { role: NavRole; admin: boolean }) {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <p className="wordmark">Certa.</p>
      <nav aria-label="Sections">
        {itemsFor(role, admin).map((item) => (
          <Link key={item.href} href={item.href} data-active={path === item.href ? "true" : "false"}>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
