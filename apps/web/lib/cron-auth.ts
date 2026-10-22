import { tokensMatch } from "../../../src/server/auth/http";
import { apiError } from "./schemas";

export function requireCronSecret(request: Request): Response | null {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return apiError(503, "The job runner is not configured.", "unconfigured");
  const header = request.headers.get("x-cron-secret") ?? "";
  const bearer = request.headers.get("authorization") ?? "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice("Bearer ".length) : "";
  const headerOk = header.length > 0 && tokensMatch(header, secret);
  const bearerOk = token.length > 0 && tokensMatch(token, secret);
  if (!headerOk && !bearerOk) return apiError(401, "That request is not allowed.", "unauthorized");
  return null;
}
