export const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateJoinCode(randomBytes: Uint8Array): string {
  if (randomBytes.length < 8) throw new Error("need 8 random bytes");
  let out = "";
  for (let i = 0; i < 8; i++) {
    const byte = randomBytes[i] ?? 0;
    out += JOIN_ALPHABET[byte % JOIN_ALPHABET.length];
  }
  return out;
}

const JOIN_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export function joinDeepLink(botUsername: string, code: string): string {
  const name = botUsername.replace(/^@/, "");
  return `https://t.me/${name}?start=${code}`;
}

export function codeFromInvite(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const start = url.searchParams.get("start");
    if (start) {
      const parsed = parseStartPayload(start);
      return parsed.kind === "join" ? parsed.code : null;
    }
  } catch {
    // A bare code is not a URL.
  }
  const parsed = parseStartPayload(trimmed);
  return parsed.kind === "join" ? parsed.code : null;
}

export function parseStartPayload(payload: string | undefined): { kind: "join"; code: string } | { kind: "plain" } {
  if (!payload) return { kind: "plain" };
  const raw = payload.startsWith("join_") ? payload.slice(5) : payload;
  const code = raw.trim().toUpperCase();
  if (!JOIN_CODE.test(code)) return { kind: "plain" };
  return { kind: "join", code };
}
