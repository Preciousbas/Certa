export const runtime = "nodejs";

export function POST(): Response {
  return Response.json({ error: "gone", message: "Upload the file to the signed storage URL." }, { status: 410 });
}
