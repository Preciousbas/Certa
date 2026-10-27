/** Trim a reason so the template's own full stop is the only one. */
export function sentence(text: string): string {
  return text.trim().replace(/[.!?]+$/u, "").trim();
}
