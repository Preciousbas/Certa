export function peopleAuthState(input: {
  telegramReady: boolean;
  status: number | null;
  hasInitData: boolean;
}): "loading" | "ready" | "sign-in" | "forbidden" | "error" {
  if (!input.telegramReady || input.status === null) return "loading";
  if (input.status === 200) return "ready";
  if (input.status === 403) return "forbidden";
  if (input.status === 401 && input.hasInitData) return "error";
  if (input.status === 401) return "sign-in";
  return "error";
}
