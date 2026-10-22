export const dynamic = "force-dynamic";

/** A priced route would charge before we have a real price. This one does not. */
export function GET(): Response {
  return Response.json(
    { error: "not_available", message: "Materials prices are not available yet." },
    { status: 503 },
  );
}
