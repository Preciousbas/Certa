import { createHash } from "node:crypto";

/** sha256(stageId || sorted photo sha256 hex strings). The digest is the bytes32 for submitStage. */
export function evidenceHash(stageId: string, photoSha256s: readonly string[]): `0x${string}` {
  const body = `${stageId}${[...photoSha256s].sort().join("")}`;
  return `0x${createHash("sha256").update(body).digest("hex")}`;
}
