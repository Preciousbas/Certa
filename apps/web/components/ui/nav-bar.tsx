"use client";

import { BOTTOM_NAV, MORE_NAV, sectionHref } from "../../../../src/components/ui/nav";
import {
  Clock,
  CreditCard,
  FileText,
  FolderOpen,
  GitPullRequestArrow,
  Layers,
  Lock,
  Menu,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ICONS = {
  timeline: Clock,
  stages: Layers,
  fund: Lock,
  changes: GitPullRequestArrow,
  more: Menu,
  reports: FileText,
  documents: FolderOpen,
  people: Users,
  wallet: Wallet,
  billing: CreditCard,
  settings: Settings,
} as const;

function active(path: string, href: string): boolean {
  if (href === "/app") return path === "/app";
  return path === href || path.startsWith(`${href}/`);
}

export function BottomNav({ projectId }: { projectId: string | null }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const pathSeen = useRef(path);
  const openRef = useRef(false);
  openRef.current = open;

  useEffect(() => {
    if (pathSeen.current === path) return;
    pathSeen.current = path;
    const returnFocus = openRef.current;
    setOpen(false);
    if (returnFocus) moreRef.current?.focus();
  }, [path]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        moreRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {mounted && open
        ? createPortal(
            <>
              <button
                type="button"
                className="sheet-backdrop"
                aria-label="Close menu"
                onClick={() => {
                  setOpen(false);
                  moreRef.current?.focus();
                }}
              />
              <div className="more-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <p id={titleId} className="eyebrow">More</p>
                {MORE_NAV.map((item) => {
                  const Icon = ICONS[item.id];
                  const href = sectionHref(projectId, item.id);
                  return (
                    <Link
                      key={item.id}
                      href={href}
                      prefetch={false}
                      onClick={(event) => {
                        event.preventDefault();
                        setOpen(false);
                        moreRef.current?.focus();
                        router.push(href);
                      }}
                    >
                      <Icon size={20} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </>,
            document.body,
          )
        : null}
      <nav className="bottom-nav" aria-label="Primary">
        {BOTTOM_NAV.map((item) => {
          const Icon = ICONS[item.id];
          if (item.id === "more") {
            return (
              <button
                key={item.id}
                ref={moreRef}
                type="button"
                data-active={open ? "true" : "false"}
                aria-expanded={open}
                aria-current={open ? "page" : undefined}
                onClick={() => setOpen((value) => !value)}
              >
                <Icon size={24} aria-hidden="true" />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          }
          const href = sectionHref(projectId, item.id);
          const on = active(path, href);
          return (
            <Link key={item.id} href={href} data-active={on ? "true" : "false"} aria-current={on ? "page" : undefined}>
              <Icon size={24} aria-hidden="true" />
              <span className="nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function Sidebar({ projectId }: { projectId: string | null }) {
  const path = usePathname();
  const items = [
    ...BOTTOM_NAV.filter((item) => item.id !== "more"),
    ...MORE_NAV,
  ];
  return (
    <aside className="sidebar">
      <p className="wordmark">Certa.</p>
      <nav aria-label="Sections">
        {items.map((item) => {
          const Icon = ICONS[item.id];
          const href = sectionHref(projectId, item.id);
          const on = active(path, href);
          return (
            <Link key={item.id} href={href} data-active={on ? "true" : "false"} aria-current={on ? "page" : undefined}>
              <Icon size={20} aria-hidden="true" />
              <span className="nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
