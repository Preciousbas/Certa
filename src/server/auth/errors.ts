export class AuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

export function authResponse(error: AuthError): Response {
  const requestId = crypto.randomUUID();
  return Response.json(
    { error: error.code, message: error.message, requestId },
    { status: error.status },
  );
}

export const NOT_SIGNED_IN = new AuthError(401, "not_signed_in", "Sign in from Telegram.");
export const SESSION_EXPIRED = new AuthError(
  401,
  "session_expired",
  "Your session has expired. Close and reopen Certa in Telegram.",
);
export const FORBIDDEN = new AuthError(
  403,
  "forbidden",
  "You don't have permission to do this on this project.",
);

export function failureResponse(error: unknown): Response {
  if (error instanceof AuthError) return authResponse(error);
  const requestId = crypto.randomUUID();
  const message = error instanceof Error ? error.message : "failed";
  console.error(JSON.stringify({ requestId, message }));
  return Response.json(
    { error: "request_failed", message: "Something went wrong. Try again.", requestId },
    { status: 500 },
  );
}
