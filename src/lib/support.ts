const PLACEHOLDER = "support@example.com";

/** Empty when support mail is unset or still the example placeholder. */
export function supportEmailOrEmpty(value?: string | null): string {
  const email = (value ?? process.env.SUPPORT_EMAIL ?? "").trim();
  if (!email || email.toLowerCase() === PLACEHOLDER) return "";
  return email;
}
