/** Telegram allows 1–64 bytes of callback_data. */
export const CALLBACK_LIMIT = 64;

export function callbackData(action: string, id = "", arg = ""): string {
  const parts = ["v1", action];
  if (id) parts.push(id);
  if (arg) parts.push(arg);
  const data = parts.join(":");
  if (Buffer.byteLength(data) > CALLBACK_LIMIT) {
    throw new Error("callback data exceeds 64 bytes");
  }
  return data;
}

export function parseCallback(data: string): { action: string; id: string; arg: string } | null {
  if (!data.startsWith("v1:")) return null;
  const [, action = "", id = "", arg = ""] = data.split(":");
  if (!action) return null;
  return { action, id, arg };
}
