import { documents } from "@certa/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, apiJson, documentsInput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

const documentsOutput = z
  .object({
    documents: z.array(z.object({ id: z.string().uuid() }).strict()),
  })
  .strict();

export const POST = withAuth(
  async ({ db, project, json }) => {
    const input = documentsInput.safeParse(json);
    if (!input.success) return apiError(400, "This project is missing.");
    const rows = await db.select({ id: documents.id }).from(documents).where(eq(documents.projectId, project.id));
    return apiJson(documentsOutput, { documents: rows.map((row) => ({ id: row.id })) });
  },
  { roles: ["client", "consultant", "contractor", "viewer"] },
);
