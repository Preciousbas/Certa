import { contractFromBill, sniffDocument, textFromUpload } from "@certa/ai";
import { formatNgnFromKobo } from "@certa/shared";
import { z } from "zod";
import { apiError } from "../../../../lib/schemas";
import { withUser } from "../../../../lib/with-auth";

export const runtime = "nodejs";

const MAX_BYTES = 8_000_000;

const previewFile = z
  .object({
    name: z.string().min(1).max(240),
    size: z.number().int().positive().max(MAX_BYTES),
  })
  .strict();

export const POST = withUser(async (_userId, request) => {
  const form = await request.formData().catch(() => null);
  if (!form) return apiError(400, "Choose a contract or a bill of quantities.");
  const unknown = [...form.keys()].filter((key) => key !== "file");
  if (unknown.length > 0) return apiError(400, "Choose a contract or a bill of quantities.");
  const file = form.get("file");
  if (!(file instanceof File)) return apiError(400, "Choose a contract or a bill of quantities.");
  const parsed = previewFile.safeParse({ name: file.name, size: file.size });
  if (!parsed.success) return apiError(400, "That file is too large. Send a file under 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffDocument(file.name, bytes);
  if (kind === "heic") return apiError(400, "Send a JPEG or PNG photo of the page.");
  if (kind === "jpeg" || kind === "png") {
    return apiError(400, "Send the Excel bill or a PDF. A photo of the page is not read yet.");
  }
  if (!kind) return apiError(400, "That file is not a PDF, Word, Excel, or CSV.");
  const text = await textFromUpload(file.name, bytes).catch(() => "");
  const bill = contractFromBill(text, file.name);
  if (!bill) {
    return apiError(422, "No bill table was found. The sheet needs item, description, quantity, rate, and amount.");
  }
  return Response.json({
    contractSum: formatNgnFromKobo(BigInt(bill.summary.contractSumKobo)),
    stages: bill.summary.stages.map((stage, index) => ({
      number: index + 1,
      name: stage.name,
      amount: formatNgnFromKobo(BigInt(stage.amountKobo ?? "0")),
      criteria: stage.description,
    })),
    issues: bill.flags,
  });
});
