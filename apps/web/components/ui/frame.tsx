"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MoneyProvider, MoneySwitch } from "../money";
import { TelegramChrome } from "../telegram";
import { AppFooter, ProjectSwitcher } from "./dialog";
import { BottomNav, Sidebar } from "./nav-bar";
import { PageContainer } from "./page";

const MARKETING = new Set(["/", "/login", "/terms", "/privacy"]);

export function AppFrame({
  children,
  sample,
  syncing,
  projectId,
  projects,
  factory,
  factoryHref,
  supportEmail,
  fxLine,
}: {
  children: ReactNode;
  sample: boolean;
  syncing: boolean;
  projectId: string | null;
  projects: { id: string; name: string }[];
  factory: string;
  factoryHref: string;
  supportEmail: string;
  fxLine: string | null;
}) {
  const path = usePathname();
  const marketing = MARKETING.has(path);
  const mini = path.startsWith("/mini");
  if (marketing) {
    return (
      <>
        <TelegramChrome />
        {children}
      </>
    );
  }
  const showMoneyFx = /\/fund|\/stages|\/billing|\/wallet|\/certificate|\/reports/.test(path);
  return (
    <div className="app">
      {mini ? null : <Sidebar projectId={projectId} />}
      <div className="shell">
        <TelegramChrome />
        <MoneyProvider>
          <div className="topbar">
            <div className="topbar-start">
              {sample ? <p className="sample-badge">Demo workspace</p> : null}
              <ProjectSwitcher projects={projects} currentId={projectId} />
            </div>
            <MoneySwitch />
          </div>
          {syncing ? <p className="sample-badge">Updating from the blockchain</p> : null}
          <main id="main">
            <PageContainer>{children}</PageContainer>
          </main>
          <AppFooter factory={factory} factoryHref={factoryHref} supportEmail={supportEmail} fxLine={showMoneyFx ? fxLine : null} />
          {mini ? null : <BottomNav projectId={projectId} />}
        </MoneyProvider>
      </div>
    </div>
  );
}
