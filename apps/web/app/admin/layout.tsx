import { getDatabase } from "@certa/db";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { audit } from "../../../../src/server/audit";
import { requirePlatformAdmin, runAsUser } from "../../../../src/server/auth/rbac";
import { openSession } from "../../../../src/server/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const token = jar.get("certa_session")?.value;
  if (!token) notFound();
  try {
    const claims = await openSession(token);
    const db = await getDatabase();
    await runAsUser({ db, userId: claims.sub }, () => requirePlatformAdmin());
    await audit(db, {
      action: "admin.view",
      entity: "admin",
      entityId: "desk",
      actor: claims.sub,
      actorKind: "admin",
    });
  } catch {
    notFound();
  }
  return children;
}
