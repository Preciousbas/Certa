import { createHash } from "node:crypto";
import { approvals, getDatabase, parties, payments, projects, stages, users } from "@certa/db";
import { renderPaymentCertificate } from "@certa/pdf";
import { objectKey, putObject, signedUrl } from "../../../../../../../../../src/server/storage";
import { and, eq } from "drizzle-orm";
import { attachCookies } from "../../../../../../../../../src/server/auth/authenticate";
import { failureResponse } from "../../../../../../../../../src/server/auth/errors";
import { requireMember, runAsUser } from "../../../../../../../../../src/server/auth/rbac";
import { formatNaira } from "../../../../../../../../../src/lib/money/kobo";
import { formatUsdc } from "../../../../../../../../../src/lib/money/usdc";
import { explorerTx, SEPOLIA_CHAIN_ID } from "../../../../../../../lib/explorer";
import { requireUser } from "../../../../../../../lib/with-auth";

function when(date: Date | null | undefined): string {
  if (!date) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(date) + " WAT";
}

export async function GET(request: Request, context: { params: Promise<{ id: string; n: string }> }) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (error) {
    return failureResponse(error);
  }
  if (auth instanceof Response) return auth;
  const { id, n } = await context.params;
  const db = await getDatabase();
  try {
    await runAsUser({ db, userId: auth.user.id }, () => requireMember(id));
  } catch (error) {
    return attachCookies(failureResponse(error), auth.setCookies);
  }
  const number = Number(n);
  const project = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  const stage = (
    await db.select().from(stages).where(and(eq(stages.projectId, id), eq(stages.stageIndex, number - 1)))
  )[0];
  if (!project || !stage || stage.status !== "released") {
    return new Response("The certificate is available after the stage is released.", { status: 404 });
  }
  const paid = (await db.select().from(payments).where(eq(payments.stageId, stage.id))).find((row) => row.txHash);
  const txHash = paid?.txHash && /^0x[a-fA-F0-9]{64}$/.test(paid.txHash) ? paid.txHash : "No transaction hash is stored";
  const partyRows = await db.select().from(parties).where(eq(parties.projectId, project.id));
  const people = await db.select().from(users);
  const nameOf = (role: string) => {
    const party = partyRows.find((row) => row.role === role);
    return people.find((person) => person.id === party?.userId)?.name ?? role;
  };
  const decisions = await db.select().from(approvals).where(eq(approvals.stageId, stage.id));
  const consultant = decisions.find((row) => row.decision === "certified");
  const client = decisions.find((row) => row.decision === "approved");
  const retention = (stage.amountNgnKobo * BigInt(stage.retentionBps)) / 10000n;
  const net = stage.amountNgnKobo - retention;
  const released = (await db.select().from(stages).where(eq(stages.projectId, project.id))).filter((row) => row.status === "released" && row.stageIndex <= stage.stageIndex);
  const cumulative = released.reduce((sum, row) => sum + row.amountNgnKobo - (row.amountNgnKobo * BigInt(row.retentionBps)) / 10000n, 0n);
  const fx = `${formatNaira(project.fxRateLocked)} per USDC · ${project.fxSource}, set ${when(project.fxLockedAt)}`;
  const explorer = txHash.startsWith("0x") ? explorerTx(SEPOLIA_CHAIN_ID, txHash) : "https://sepolia.etherscan.io";
  const pdf = await renderPaymentCertificate({
    certificateNo: `PC-${stage.stageIndex + 1}-${stage.id.slice(0, 8)}`,
    project: project.name,
    parties: `${nameOf("client")} / ${nameOf("main_contractor")}`,
    stage: `${stage.stageIndex + 1}. ${stage.name}`,
    gross: `${formatNaira(stage.amountNgnKobo)} (${formatUsdc(stage.amountUsdc, { dp: 6 })})`,
    retention: formatNaira(retention),
    net: formatNaira(net),
    cumulative: formatNaira(cumulative),
    fxLine: fx,
    txHash,
    explorerUrl: explorer,
    consultant: consultant ? `${nameOf("consultant")}, ${when(consultant.at)}` : "Not recorded",
    clientApproval: client ? `${nameOf("client")}, ${when(client.at)}` : "Not recorded",
  });
  const bytes = new Uint8Array(pdf);
  const digest = createHash("sha256").update(bytes).digest("hex");
  try {
    const key = objectKey({ workspaceId: project.workspaceId, projectId: project.id, ext: "pdf" });
    await putObject({ bucket: "certificates", key, bytes, contentType: "application/pdf", sha256: digest });
    const url = await signedUrl("certificates", key);
    return attachCookies(Response.redirect(url, 302), auth.setCookies);
  } catch {
    return attachCookies(
      new Response(Buffer.from(bytes), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="certificate-${stage.stageIndex + 1}.pdf"`,
        },
      }),
      auth.setCookies,
    );
  }
}
