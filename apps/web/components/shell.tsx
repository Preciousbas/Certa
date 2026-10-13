import Link from "next/link";

const links = [
  ["/", "Timeline"],
  ["/stages", "Stages"],
  ["/capture", "Camera"],
  ["/fund", "Fund"],
  ["/changes", "Changes"],
  ["/wallet", "Account"],
  ["/report", "Report"],
  ["/billing", "Plan"],
  ["/cashout", "Cash out"],
  ["/admin", "Desk"],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <p className="eyebrow">Certa · site payments</p>
      <nav className="nav">
        {links.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
