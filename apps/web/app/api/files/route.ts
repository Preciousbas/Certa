import { apiError, emptyQuery } from "../../../lib/schemas";
import { requireSignedDownload } from "../../../lib/signed-download";

export async function GET(request: Request) {
  const file = requireSignedDownload(request);
  if (file instanceof Response) return file;
  const extra = emptyQuery.safeParse({});
  if (!extra.success) return apiError(400, "That link is expired or not yours.");
  return Response.json({ key: file.key, userId: file.userId, expiresAt: file.expiresAt });
}
