import { headers } from "next/headers";
import { LoginWidget } from "../../components/login-widget";
import { appOrigin } from "../../../../src/server/auth/http";

export default async function LoginPage() {
  const username = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || "CertaApp_bot";
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "";
  const proto = incoming.get("x-forwarded-proto") ?? "http";
  const origin = appOrigin() || (host ? `${proto}://${host}` : "");
  return (
    <div>
      <p className="eyebrow">Account</p>
      <h1>Sign in</h1>
      <p className="muted">Sign in with Telegram to start a project or join one.</p>
      <div className="card">
        <LoginWidget username={username.replace(/^@/, "")} authUrl={origin ? `${origin}/api/auth/telegram` : ""} />
      </div>
    </div>
  );
}
