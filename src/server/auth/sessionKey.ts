import { AuthError } from "./errors.js";

export async function sessionKey(): Promise<Uint8Array> {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) throw new AuthError(500, "request_failed", "Something went wrong. Try again.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return new Uint8Array(digest);
}
