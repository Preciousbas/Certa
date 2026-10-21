import { verifyDownload } from "@certa/db";
import { apiError, fileQuery, queryOf } from "./schemas";

export function requireSignedDownload(request: Request) {
  const query = fileQuery.safeParse(queryOf(request));
  if (!query.success) return apiError(401, "That link is expired or not yours.", "not_signed_in");
  const secret = process.env.APP_ENCRYPTION_KEY || "certa-demo-not-for-production";
  const file = verifyDownload(new URL(request.url).search, secret);
  if (!file) return apiError(401, "That link is expired or not yours.", "not_signed_in");
  return file;
}
