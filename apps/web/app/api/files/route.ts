import { verifyDownload } from "@certa/db";

export async function GET(request: Request) {
  const secret = process.env.APP_ENCRYPTION_KEY ?? "certa-demo-not-for-production";
  const url = new URL(request.url);
  const file = verifyDownload(url.search, secret);
  if (!file) return Response.json({ error: "That link is expired or not yours." }, { status: 401 });
  return Response.json({ key: file.key, userId: file.userId, expiresAt: file.expiresAt });
}
