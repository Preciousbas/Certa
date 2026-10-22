/** Escape text that came from a person before it is placed in an HTML message. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Catalogue copy uses ** for emphasis. Telegram receives HTML. */
export function toHtml(text: string): string {
  return text.replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>");
}
