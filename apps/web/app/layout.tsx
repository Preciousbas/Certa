import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Shell } from "../components/shell";
import { fxLineFor } from "../lib/money-display";
import { SEPOLIA_CHAIN_ID, explorerAddress } from "../lib/explorer";
import { loadProject } from "../lib/data";
import { supportEmailOrEmpty } from "../../../src/lib/support";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const data = await loadProject();
  const factory = process.env.ESCROW_FACTORY_ADDRESS || PUBLISHED_FACTORY;
  const supportEmail = supportEmailOrEmpty();
  const fxLine = data ? fxLineFor(data.project) : null;
  return (
    <html lang="en">
      <body className={body.variable}>
        <Shell
          sample={data?.isDemo === true}
          syncing={data?.project.chainSync === "updating"}
          projectId={data?.project.id ?? null}
          projects={data?.projects ?? []}
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
