import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { formatNaira } from "../../../src/lib/money/kobo";
import { Shell } from "../components/shell";
import { SEPOLIA_CHAIN_ID, explorerAddress } from "../lib/explorer";
import { loadProject } from "../lib/data";
import { PUBLISHED_FACTORY } from "../lib/published-chain";
import "./globals.css";

const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Certa",
  description: "Pay for building work only when it's done.",
};

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

function when(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Lagos",
  }).format(date);
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const data = await loadProject();
  const factory = process.env.ESCROW_FACTORY_ADDRESS || PUBLISHED_FACTORY;
  const supportEmail = process.env.SUPPORT_EMAIL || "support@example.com";
  const fxLine = data
    ? `${formatNaira(data.project.fxRateLocked)} per USDC · ${data.project.fxSource}, set ${when(data.project.fxLockedAt ?? data.project.createdAt)}`
    : null;
  return (
    <html lang="en">
      <body className={body.variable}>
        <Shell
          sample={data?.isDemo === true}
          syncing={data?.project.chainSync === "updating"}
          projectId={data?.project.id ?? null}
          projects={data ? [{ id: data.project.id, name: data.project.name }] : []}
          factory={`${factory.slice(0, 6)}…${factory.slice(-4)}`}
          factoryHref={explorerAddress(SEPOLIA_CHAIN_ID, factory)}
          supportEmail={supportEmail}
          fxLine={fxLine}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
