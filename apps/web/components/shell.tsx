import { BottomNav, type NavRole } from "./bottom-nav";
import { MoneyProvider, MoneySwitch } from "./money";
import { Sidebar } from "./sidebar";
import { TelegramChrome } from "./telegram";

export function Shell({
  children,
  sample = false,
  role = "client",
  admin = false,
}: {
  children: React.ReactNode;
  sample?: boolean;
  role?: NavRole;
  admin?: boolean;
}) {
  return (
    <div className="app">
      <Sidebar role={role} admin={admin} />
      <div className="shell">
        <TelegramChrome />
        <MoneyProvider>
          <div className="topbar">
            {sample ? <p className="sample-badge">Demo workspace</p> : <span />}
            <MoneySwitch />
          </div>
          <main>{children}</main>
          <BottomNav role={role} admin={admin} />
        </MoneyProvider>
      </div>
    </div>
  );
}
