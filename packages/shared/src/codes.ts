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

export function joinDeepLink(botUsername: string, code: string): string {
  const name = botUsername.replace(/^@/, "");
  return `https://t.me/${name}?start=join_${code}`;
}

export function parseStartPayload(payload: string | undefined): { kind: "join"; code: string } | { kind: "plain" } {
  if (!payload) return { kind: "plain" };
  if (payload.startsWith("join_") && payload.length === 13) {
    return { kind: "join", code: payload.slice(5).toUpperCase() };
  }
  return { kind: "plain" };
}
