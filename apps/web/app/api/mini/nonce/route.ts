import { captureNonces, getDatabase, projects, sha256Hex, users } from "@certa/db";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

export async function POST() {
  const db = await getDatabase();
  const user = (await db.select().from(users).where(eq(users.telegramId, 1001n)))[0];
  const project = (await db.select().from(projects)).find((row) => row.name.startsWith("EM 22"));
  if (!user || !project) return Response.json({ error: "No project." }, { status: 404 });
  const nonce = randomBytes(16).toString("hex");
  await db.insert(captureNonces).values({
    projectId: project.id,
    userId: user.id,
    nonceHash: sha256Hex(nonce),
    expiresAt: new Date(Date.now() + 2 * 60 * 1000),
  });
  return Response.json({ nonce });
}
