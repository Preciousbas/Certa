export function adminTelegramIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_TELEGRAM_IDS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

export function tokensMatch(left: string, right: string): boolean {
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export function appOrigin(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

export function cookieSecure(): boolean {
  const url = appOrigin();
  return url.startsWith("https://") || process.env.NODE_ENV === "production";
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    const value = trimmed.slice(eq + 1);
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}

export function originAllowed(origin: string | null): boolean {
  if (!origin) return false;
  const app = appOrigin();
  if (app && origin === app) return true;
  try {
    const host = new URL(origin).hostname;
    if (host === "web.telegram.org" || host === "telegram.org" || host.endsWith(".telegram.org")) return true;
  } catch {
    return false;
  }
  return false;
}

export function usesMiniAppAuth(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  return /^tma\s+\S/i.test(header.trim());
}
