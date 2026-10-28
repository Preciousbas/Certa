import { cookies } from "next/headers";
import { openSession } from "../../../src/server/auth/sessionOpen";

export async function signedInUserId(): Promise<string | null> {
  try {
    const jar = await cookies();
    const token = jar.get("certa_session")?.value;
    if (!token) return null;
    return (await openSession(token)).sub;
  } catch {
    return null;
  }
}
