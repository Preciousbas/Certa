import { contractFromBill, sniffDocument, textFromUpload } from "@certa/ai";
import { formatNgnFromKobo } from "@certa/shared";

export const runtime = "nodejs";

const MAX_BYTES = 8_000_000;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a contract or a bill of quantities." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is too large. Send a file under 8 MB." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffDocument(file.name, bytes);
  if (kind === "heic") return Response.json({ error: "Send a JPEG or PNG photo of the page." }, { status: 400 });
  if (kind === "jpeg" || kind === "png") {
    return Response.json({ error: "Send the Excel bill or a PDF. A photo of the page is not read yet." }, { status: 400 });
  }
  if (!kind) return Response.json({ error: "That file is not a PDF, Word, Excel, or CSV." }, { status: 400 });
  const text = await textFromUpload(file.name, bytes).catch(() => "");
  const parsed = contractFromBill(text, file.name);
  if (!parsed) {
    return Response.json(
      { error: "No bill table was found. The sheet needs item, description, quantity, rate, and amount." },
      { status: 422 },
    );
  }
  return Response.json({
    contractSum: formatNgnFromKobo(BigInt(parsed.summary.contractSumKobo)),
    stages: parsed.summary.stages.map((stage, index) => ({
      number: index + 1,
      name: stage.name,
      amount: formatNgnFromKobo(BigInt(stage.amountKobo ?? "0")),
      criteria: stage.description,
    })),
    issues: parsed.flags,
  });
}
