import { aiVerdicts, auditLog, chainTxs, getDatabase, photos, projects, stages, x402Spend } from "@certa/db";
import { eq } from "drizzle-orm";
import { MoneyAmount } from "./money";
import { TimelineView, type TimelineItem } from "./timeline-view";
import { BASE_SEPOLIA_CHAIN_ID, explorerTx, SEPOLIA_CHAIN_ID } from "../lib/explorer";
import { photoThumb } from "../lib/photo-thumb";

function formatWat(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("day")} ${read("month")} ${read("year")}, ${read("hour")}:${read("minute")} WAT`;
}

function usdcPlain(micro: bigint): string {
  const sign = micro < 0n ? "-" : "";
  const abs = micro < 0n ? -micro : micro;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n) / 10_000n;
  return `${sign}${whole.toString()}.${frac.toString().padStart(2, "0")}`;
}

function dayLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Lagos",
  }).format(date);
}

function relative(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function bucket(action: string): string {
  if (action === "photos_submitted") return "photos";
  if (action === "ai_verdict" || action === "ai_override") return "ai";
  if (action === "certified" || action === "rejected" || action === "approved" || action === "declined" || action === "stage_submitted_onchain") return "approvals";
  if (action === "funded" || action === "released" || action === "escrow_created" || action === "fund") return "payments";
  if (action.startsWith("variation") || action.startsWith("dispute") || action.includes("change")) return "changes";
  if (action.startsWith("x402") || action.includes("fee")) return "fees";
  return "other";
}

function titleFor(action: string): string {
  const names: Record<string, string> = {
    document_uploaded: "Document uploaded",
    extraction_ready: "Figures read",
    contract_accepted: "Contract agreed",
    escrow_created: "Escrow created",
    funded: "Money locked",
    fund: "Money locked",
    photos_submitted: "Photos sent",
    ai_verdict: "Photo check",
    ai_override: "A person checked the photos",
    stage_submitted_onchain: "Sent for certification",
    certified: "Consultant certified",
    client_override: "Client approved after the photo check flagged it",
    rejected: "Consultant asked for changes",
    approved: "Client approved",
    declined: "Client declined",
    released: "Payment released",
    x402_payment: "Fee paid",
    "project.planned_start": "Planned start",
  };
  return names[action] ?? action.replaceAll("_", " ");
}

export async function ProjectTimeline({ projectId, cursor }: { projectId: string; cursor: number }) {
  const db = await getDatabase();
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (!project) return <p>Something went wrong loading the timeline. Try again.</p>;
  const events = (await db.select().from(auditLog).where(eq(auditLog.projectId, projectId))).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const stageRows = await db.select().from(stages).where(eq(stages.projectId, projectId));
  const shots = await db.select().from(photos).where(eq(photos.projectId, projectId));
  const verdicts = (await db.select().from(aiVerdicts)).filter((row) => stageRows.some((stage) => stage.id === row.stageId));
  const txs = await db.select().from(chainTxs).where(eq(chainTxs.projectId, projectId));
  const spends = await db.select().from(x402Spend).where(eq(x402Spend.projectId, projectId));
  const thumbs = new Map<string, string | null>();
  for (const shot of shots) thumbs.set(shot.id, await photoThumb(shot.stampedKey || shot.storageKey));
  const stageNumber = new Map(stageRows.map((stage) => [stage.id, stage.stageIndex + 1]));
  const items: TimelineItem[] = events.map((event) => {
    const related = event.action === "photos_submitted" ? shots.filter((shot) => shot.submissionId === event.entityId) : [];
    const verdict = event.action === "ai_verdict" ? verdicts.find((row) => row.submissionId === event.entityId) : undefined;
    const label = verdict?.verdict === "pass" ? "Pass" : verdict?.verdict === "fail" ? "Fail" : verdict ? "Not sure" : "";
    const tx = txs.find((row) => row.txHash && (row.id === event.entityId || row.stageId === event.entityId));
    const proof = tx?.txHash ? explorerTx(tx.chainId === BASE_SEPOLIA_CHAIN_ID ? BASE_SEPOLIA_CHAIN_ID : SEPOLIA_CHAIN_ID, tx.txHash) : undefined;
    return {
      id: event.id,
      stamp: event.createdAt.getTime(),
      day: dayLabel(event.createdAt),
      when: relative(event.createdAt),
      absolute: formatWat(event.createdAt),
      filter: bucket(event.action),
      title: verdict ? `Photo check · ${label} · ${Math.round(verdict.confidence * 100)}%` : titleFor(event.action),
      detail: verdict?.reasons.join(" ") || event.reason || "",
      proof,
      thumbs: related.flatMap((shot, index) => {
        const src = thumbs.get(shot.id);
        if (!src) return [];
        const stageN = shot.stageId ? stageNumber.get(shot.stageId) ?? "?" : "?";
        return [{ src, alt: `Site photo ${index + 1} for stage ${stageN}, taken ${shot.capturedAt ? formatWat(shot.capturedAt) : "an unknown time"}` }];
      }),
    };
  });
  for (const spend of spends) {
    const tx = txs.find((row) => row.id === spend.chainTxId);
    items.push({
      id: spend.id,
      stamp: spend.createdAt.getTime(),
      day: dayLabel(spend.createdAt),
      when: relative(spend.createdAt),
      absolute: formatWat(spend.createdAt),
      filter: "fees",
      title: `Agent paid ${usdcPlain(spend.amountMicro)} USDC for a weather check`,
      detail: spend.resultSummary ?? "",
      proof: tx?.txHash ? explorerTx(BASE_SEPOLIA_CHAIN_ID, tx.txHash) : undefined,
    });
  }
  items.sort((a, b) => b.stamp - a.stamp);
  const start = Number.isFinite(cursor) && cursor > 0 ? Math.floor(cursor) : 0;
  const page = items.slice(start, start + 30);
  const next = start + 30 < items.length ? `?cursor=${start + 30}` : null;
  const released = stageRows.filter((stage) => stage.status === "released");
  const releasedKobo = released.reduce((sum, stage) => sum + stage.amountNgnKobo, 0n);
  const releasedUsdc = released.reduce((sum, stage) => sum + stage.amountUsdc, 0n);
  return (
    <div className="timeline-layout">
      <div>
        <p className="eyebrow">Timeline</p>
        <h1>{project.name}</h1>
        <TimelineView items={page} total={items.length} nextHref={next} />
      </div>
      <aside className="card glance">
        <h2>Project at a glance</h2>
        <p>{project.siteLocation}</p>
        <p>{stageRows.length === 1 ? "1 stage" : `${stageRows.length} stages`}</p>
        <p>{shots.length} photos</p>
        <p>Released <MoneyAmount kobo={releasedKobo.toString()} usdc={releasedUsdc.toString()} /></p>
      </aside>
    </div>
  );
}
