import { sniffDocument } from "@certa/ai";
import { z } from "zod";
import { buildPreview } from "../../../../../../src/server/intake/read";
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
  const preview = await buildPreview(file.name, bytes);
  if ("error" in preview) return apiError(422, preview.error);
  return Response.json(preview);
});
