import { requireUser } from "../../../../../../../lib/with-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json({ error: "gone", message: "Upload the file to the signed storage URL." }, { status: 410 });
}
