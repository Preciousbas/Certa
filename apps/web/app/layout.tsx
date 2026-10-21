import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { Shell } from "../components/shell";
import { loadProject } from "../lib/data";
import { viewerNav } from "../lib/labels";
import "./globals.css";

const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Certa",
  description: "Site photos in. Stage payments out.",
};

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const data = await loadProject();
  const party = data?.parties.find((row) => row.userId === data.user.id);
  const nav = viewerNav(party?.role, data?.workspaceRole);
  return (
    <html lang="en">
      <body className={body.variable}>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Shell sample={data?.isDemo === true} role={nav.role} admin={nav.admin}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
