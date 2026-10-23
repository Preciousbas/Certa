import { createHash, randomBytes } from "node:crypto";
import {
  blobs,
  botSessions,
  boqItems,
  jobs,
  contractAcceptances,
  contractVersions,
  documentChunks,
  documents,
  extractions,
  projects,
  stages,
  type Database,
} from "@certa/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { audit } from "../audit.js";
import { enqueueJob } from "../jobs/enqueue.js";
import { createSignedUploadUrl, getObject, putObject } from "../storage.js";
import { citationIssues } from "./citations.js";
import { contentHash, sha256Hex } from "./hash.js";
import { interpretGrid, type GridRow } from "./interpret.js";
import { badType, duplicateUpload, SCAN_V13, watStamp, webDuplicate } from "./messages.js";
import { docModelSupportsImages, proposeWithModel } from "./model.js";
import { notifyFigures, notifyPlanShared, notifyReadFailed } from "./notify.js";
import { parseBytes, type Transcriber } from "./parse.js";
import { detectFile, failureMessage, UPLOAD_MAX_BYTES } from "./detect.js";
import { validateDraft, type ValidatedPlan } from "./validate.js";

async function readStored(storageKey: string): Promise<Uint8Array | null> {
  const remote = await getObject("documents", storageKey).catch(() => null);
  return remote?.bytes ?? null;
}

const ALLOWED_UPLOAD = /\.(pdf|docx|xlsx|xls|csv|jpe?g|png|heic|heif)$/i;

export async function signedDocumentUpload(
  db: Database,
  input: { projectId: string; workspaceId: string; userId: string; fileName: string; size?: number },
): Promise<{ uploadUrl: string; token: string; path: string; documentId: string } | { error: string }> {
  if (!ALLOWED_UPLOAD.test(input.fileName)) return { error: badType(input.fileName.includes(".") ? (input.fileName.split(".").pop() ?? "file") : "file") };
  if (input.size !== undefined && input.size > UPLOAD_MAX_BYTES) return { error: "This file is bigger than 20 MB." };
  const documentId = crypto.randomUUID();
  const placeholder = randomBytes(32).toString("hex");
  const storageKey = `${input.workspaceId}/${input.projectId}/${placeholder}`;
  let signed: { uploadUrl: string; token: string; path: string };
  try {
    signed = await createSignedUploadUrl("documents", storageKey);
  } catch {
    return { error: "Storage is not configured." };
  }
  await db.insert(documents).values({
    id: documentId,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    kind: "upload",
    storageKey,
    sha256: placeholder,
    fileName: input.fileName,
    uploadedBy: input.userId,
    status: "uploaded",
  });
  return { uploadUrl: signed.uploadUrl, token: signed.token, path: signed.path, documentId };
}

export async function ingestDocument(
  db: Database,
  input: { projectId: string; workspaceId: string; userId: string; documentId?: string; fileName: string; bytes: Uint8Array },
): Promise<{ ok: true; documentId: string; pagesOrSheets: string } | { ok: false; message: string }> {
  const detected = await detectFile(input.fileName, input.bytes);
  if (!detected.ok) return { ok: false, message: failureMessage(detected.failure, input.fileName) };
  const digest = sha256Hex(input.bytes);
  const existing = (await db.select().from(documents).where(and(eq(documents.projectId, input.projectId), eq(documents.sha256, digest))))[0];
  if (existing?.fileName && existing.id !== input.documentId) {
    if (input.documentId) await db.delete(documents).where(eq(documents.id, input.documentId));
    const message = input.documentId ? webDuplicate(existing.fileName, watStamp(existing.createdAt)) : duplicateUpload(existing.fileName, watStamp(existing.createdAt));
    return { ok: false, message };
  }
  const storageKey = `${input.workspaceId}/${input.projectId}/${digest}`;
  await putObject({ bucket: "documents", key: storageKey, bytes: input.bytes, contentType: detected.mime, sha256: digest }).catch(async () => {
    await db.insert(blobs).values({ storageKey, bytes: Buffer.from(input.bytes).toString("base64"), contentType: detected.mime }).onConflictDoNothing();
  });
  const count = (await db.select().from(documents).where(eq(documents.projectId, input.projectId))).filter((row) => row.fileName && row.id !== input.documentId).length;
  if (count >= 10 && !input.documentId) return { ok: false, message: "Send at most 10 files for one extraction." };
  const documentId = input.documentId ?? crypto.randomUUID();
  const base = {
    fileName: input.fileName,
    mimeType: detected.mime,
    detectedType: detected.kind,
    sizeBytes: input.bytes.length,
    sha256: digest,
    storageKey,
    status: "uploaded",
    parseStatus: "pending",
    uploadedBy: input.userId,
    kind: detected.kind,
  };
  if (input.documentId) await db.update(documents).set(base).where(eq(documents.id, documentId));
  else {
    await db.insert(documents).values({ id: documentId, projectId: input.projectId, workspaceId: input.workspaceId, ...base });
  }
  await enqueueJob(db, { kind: "parse_document", payload: { documentId }, dedupeKey: `parse:${documentId}` });
  const pagesOrSheets = detected.kind === "csv" || detected.kind === "xlsx" || detected.kind === "xls" ? "1 sheet" : "1 page";
  return { ok: true, documentId, pagesOrSheets };
}

export async function parseDocumentJob(db: Database, documentId: string, transcribe?: Transcriber): Promise<void> {
  const document = (await db.select().from(documents).where(eq(documents.id, documentId)))[0];
  if (!document) return;
  const already = await db.select().from(documentChunks).where(eq(documentChunks.documentId, documentId));
  if (already.length > 0 && document.status === "parsed") return;
  let bytes = await readStored(document.storageKey);
  if (!bytes) {
    const blob = (await db.select().from(blobs).where(eq(blobs.storageKey, document.storageKey)))[0];
    if (blob) bytes = new Uint8Array(Buffer.from(blob.bytes, "base64"));
  }
  if (!bytes) {
    await db.update(documents).set({ status: "failed", parseStatus: "failed", failureCode: "unreadable" }).where(eq(documents.id, documentId));
    await notifyReadFailed(db, { projectId: document.projectId, userIds: document.uploadedBy ? [document.uploadedBy] : [], fileName: document.fileName ?? "that file", detail: "The file didn't finish uploading." });
    return;
  }
  let parsed: Awaited<ReturnType<typeof parseBytes>>;
  try {
    parsed = await parseBytes(document.fileName ?? "file", bytes, transcribe);
  } catch {
    await db.update(documents).set({ status: "failed", parseStatus: "failed", failureCode: "unreadable" }).where(eq(documents.id, documentId));
    await notifyReadFailed(db, { projectId: document.projectId, userIds: document.uploadedBy ? [document.uploadedBy] : [], fileName: document.fileName ?? "that file", detail: "The spreadsheet could not be opened." });
    return;
  }
  if (!parsed.ok) {
    await db.update(documents).set({ status: "failed", parseStatus: "failed", failureCode: parsed.failure }).where(eq(documents.id, documentId));
    await notifyReadFailed(db, { projectId: document.projectId, userIds: document.uploadedBy ? [document.uploadedBy] : [], fileName: document.fileName ?? "that file", detail: "Please send an Excel, CSV, Word, or text PDF." });
    return;
  }
  await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
  if (parsed.document.chunks.length > 0) {
    await db.insert(documentChunks).values(parsed.document.chunks.map((chunk) => ({
      documentId,
      anchor: chunk.anchor,
      kind: chunk.kind,
      content: chunk.content,
      ocrConfidence: chunk.ocrConfidence,
      ord: chunk.ord,
    })));
  }
  await db.update(documents).set({
    status: "parsed",
    parseStatus: "parsed",
    detectedType: parsed.document.kind,
    pageCount: parsed.document.pageCount,
    sheetNames: parsed.document.sheetNames,
    failureCode: null,
    parsedJson: { rows: parsed.document.rows, scan: parsed.document.scan === true },
  }).where(eq(documents.id, documentId));
}

function serialisePlan(plan: ValidatedPlan) {
  return {
    basis: plan.basis,
    currency: plan.currency,
    contractSumKobo: plan.contractSumKobo?.toString() ?? null,
    vatBps: plan.vatBps,
    vatKobo: plan.vatKobo.toString(),
    retentionBps: plan.retentionBps,
    durationWeeks: plan.durationWeeks,
    defectsMonths: plan.defectsMonths,
    defectsPeriodDays: plan.defectsPeriodDays,
    advanceKobo: plan.advanceKobo.toString(),
    spendingCapMicro: plan.spendingCapMicro.toString(),
    koboPerUsdc: plan.koboPerUsdc.toString(),
    derived: plan.derived,
    stages: plan.stages.map((stage) => ({
      ...stage,
      netKobo: stage.netKobo.toString(),
      amountKobo: stage.amountKobo.toString(),
      amountMicro: stage.amountMicro.toString(),
    })),
    issues: plan.issues,
  };
}

export async function enqueueExtraction(db: Database, projectId: string): Promise<void> {
  const files = (await db.select().from(documents).where(eq(documents.projectId, projectId))).filter((row) => row.status === "parsed" || row.status === "uploaded");
  const key = createHash("sha256").update(files.map((file) => file.sha256).sort().join(":")).digest("hex");
  const dedupeKey = `extract:${projectId}:${key}:contract_extract.v1`;
  const existing = (await db.select().from(jobs).where(eq(jobs.dedupeKey, dedupeKey)))[0];
  if (existing) {
    if (existing.status === "running") return;
    await db.update(jobs).set({ status: "queued", attempts: 0, lastError: null, runAt: new Date(), updatedAt: new Date() }).where(eq(jobs.id, existing.id));
    return;
  }
  await enqueueJob(db, { kind: "extract_contract", payload: { projectId }, dedupeKey });
}

export async function extractDocumentJob(db: Database, projectId: string): Promise<ValidatedPlan | null> {
  const heldFiles = await db.select().from(documents).where(eq(documents.projectId, projectId));
  for (const file of heldFiles) {
    if (file.status === "parsed" || file.status === "failed") continue;
    if (file.kind === "upload" && !file.detectedType) continue;
    await parseDocumentJob(db, file.id);
  }
  const files = (await db.select().from(documents).where(eq(documents.projectId, projectId))).filter((row) => row.status === "parsed");
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (!project || files.length === 0) {
    const tried = heldFiles.filter((file) => file.detectedType || file.status === "failed");
    if (!project || tried.length === 0) return null;
    await notifyReadFailed(db, {
      projectId,
      userIds: [...new Set(tried.map((file) => file.uploadedBy).filter((id): id is string => Boolean(id)))],
      fileName: tried[0]?.fileName ?? "that file",
      detail: "Nothing in the file could be read.",
    });
    return null;
  }
  const rows: GridRow[] = [];
  const scans = files.filter((file) => (file.parsedJson as { scan?: boolean } | null)?.scan === true);
  for (const file of files) {
    const parsed = file.parsedJson as { rows?: GridRow[] } | null;
    if (parsed?.rows) rows.push(...parsed.rows);
  }
  const draft = interpretGrid(rows);
  const plan = validateDraft(draft, project.fxRateLocked);
  const held = await db.select().from(documentChunks).where(inArray(documentChunks.documentId, files.map((file) => file.id)));
  plan.issues.push(...citationIssues(draft, held.map((chunk) => ({ anchor: chunk.anchor, content: chunk.content }))));
  const images: { mime: string; base64: string; filename: string }[] = [];
  if (scans.length > 0 && docModelSupportsImages()) {
    for (const file of scans) {
      const bytes = await readStored(file.storageKey);
      if (!bytes) continue;
      const mime = file.mimeType ?? (file.detectedType === "pdf_scanned" ? "application/pdf" : "image/jpeg");
      images.push({ mime, base64: Buffer.from(bytes).toString("base64"), filename: file.fileName ?? "page" });
    }
  }
  if (scans.length > 0 && images.length === 0) {
    for (const file of scans) {
      plan.issues.push({ code: "V13", rule: "scan", severity: "warning", message: SCAN_V13, anchor: null, field: "Document", value: file.fileName ?? "scan" });
    }
  }
  const priced = draft.bills.some((bill) => bill.items.some((item) => item.rowKind === "item" && item.statedKobo !== null));
  const proposal = priced && plan.contractSumKobo
    ? { source: "parser" as const, text: null, notice: null }
    : await proposeWithModel({
      text: held.map((chunk) => chunk.content).join("\n").slice(0, 24_000) || "Read the attached document.",
      images,
    });
  if (scans.length > 0 && images.length > 0 && proposal.source !== "model") {
    plan.issues.push({ code: "V13", rule: "scan", severity: "warning", message: SCAN_V13, anchor: null, field: "Document", value: scans[0]?.fileName ?? "scan" });
  }
  const saved = {
    ...serialisePlan(plan),
    clientName: draft.clientName,
    contractorName: draft.contractorName,
    source: proposal.source,
    notice: proposal.notice,
  };
  const [created] = await db.insert(extractions).values({
    projectId,
    documentIds: files.map((file) => file.id),
    status: plan.contractSumKobo ? "succeeded" : "failed",
    model: proposal.source === "model" ? (process.env.AI_DOC_MODEL ?? "model") : "deterministic",
    promptVersion: "contract_extract.v1",
    rawJson: proposal.text ? { modelText: proposal.text, plan: serialisePlan(plan) } : serialisePlan(plan),
    validatedJson: saved,
    issues: plan.issues,
    costMicro: 0n,
    startedAt: new Date(),
    finishedAt: new Date(),
  }).returning();
  if (created) {
    const uploaders = [...new Set(files.map((file) => file.uploadedBy).filter((id): id is string => Boolean(id)))];
    if (!plan.contractSumKobo) {
      await notifyReadFailed(db, {
        projectId,
        userIds: uploaders,
        fileName: files[0]?.fileName ?? "that file",
        detail: "I couldn't find a priced list in the file.",
      });
    } else {
    await notifyFigures(db, {
      projectId,
      extractionId: created.id,
      userIds: uploaders,
      projectName: project.name,
      contractSumKobo: plan.contractSumKobo,
      vatBps: plan.vatBps,
      retentionBps: plan.retentionBps,
      defectsMonths: plan.defectsMonths,
      stages: plan.stages.map((stage) => ({ name: stage.name, amountKobo: stage.amountKobo.toString() })),
      warnings: plan.issues.length,
    });
    }
  }
  return plan;
}

type SavedStage = { name: string; amountKobo: string; amountMicro: string; acceptanceCriteria: string[]; tags: string[]; kind: string; billRefs: string[] };

export async function sendPlan(
  db: Database,
  input: { projectId: string; userId: string },
): Promise<{ ok: true; versionId: string; hash: string } | { ok: false; message: string }> {
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  if (!project) return { ok: false, message: "That project is not available." };
  if (project.currentContractVersionId) {
    const current = (await db.select().from(contractVersions).where(eq(contractVersions.id, project.currentContractVersionId)))[0];
    if (current?.status === "accepted") return { ok: false, message: "You can't change an agreed plan directly. Propose a change instead — both sides must accept it." };
  }
  const extraction = (await db.select().from(extractions).where(eq(extractions.projectId, input.projectId)).orderBy(desc(extractions.createdAt)))[0];
  const saved = extraction?.validatedJson as { stages?: SavedStage[]; contractSumKobo?: string; vatBps?: number; vatKobo?: string; retentionBps?: number; defectsPeriodDays?: number; spendingCapMicro?: string; koboPerUsdc?: string; issues?: { code: string }[] } | null;
  const hard = (saved?.issues ?? []).filter((issue) => ["V01", "V02", "V03", "V04", "V05", "V07", "V08", "V09", "V12", "V14", "V17"].includes(issue.code));
  if (!saved?.contractSumKobo || !saved.stages?.length || hard.length > 0) {
    return { ok: false, message: `Totals don't reconcile yet: fix the ${hard.length} red items before sending.` };
  }
  const files = (await db.select().from(documents).where(eq(documents.projectId, input.projectId))).filter((row) => row.status === "parsed");
  const hashes = files.map((row) => row.sha256).sort();
  const hash = contentHash({
    terms: { retention_bps: saved.retentionBps ?? 0, defects_period_days: saved.defectsPeriodDays ?? 180 },
    stages: saved.stages.map((stage) => ({ name: stage.name, amount_kobo: stage.amountKobo, amount_micro: stage.amountMicro, criteria: stage.acceptanceCriteria, tags: stage.tags })),
    fx: { kobo_per_usdc: saved.koboPerUsdc ?? project.fxRateLocked.toString(), source: project.fxSource, as_of: "2026-10-15" },
    cap: saved.spendingCapMicro ?? "1000000",
    retention: String(saved.retentionBps ?? 0),
    document_hashes: hashes,
  });
  const previous = await db.select().from(contractVersions).where(eq(contractVersions.projectId, input.projectId));
  const version = previous.reduce((max, row) => Math.max(max, row.version), 0) + 1;
  const [created] = await db.insert(contractVersions).values({
    projectId: input.projectId,
    version,
    extractionId: extraction?.id,
    status: "pending_acceptance",
    currency: "NGN",
    contractSumKobo: BigInt(saved.contractSumKobo),
    vatBps: saved.vatBps ?? 0,
    vatKobo: BigInt(saved.vatKobo ?? "0"),
    retentionBps: saved.retentionBps ?? 0,
    defectsPeriodDays: saved.defectsPeriodDays ?? 180,
    koboPerUsdc: BigInt(saved.koboPerUsdc ?? project.fxRateLocked.toString()),
    fxSource: project.fxSource,
    fxAsOf: "2026-10-15",
    spendingCapMicro: BigInt(saved.spendingCapMicro ?? "1000000"),
    terms: { retention_bps: saved.retentionBps ?? 0 },
    documentHashes: hashes,
    contentHash: hash,
    createdBy: input.userId,
  }).returning();
  if (!created) return { ok: false, message: "The plan could not be sent." };
  await db.delete(stages).where(eq(stages.projectId, input.projectId));
  await db.insert(stages).values(saved.stages.map((stage, index) => ({
    projectId: input.projectId,
    workspaceId: project.workspaceId,
    stageIndex: index + 1,
    name: stage.name,
    description: stage.acceptanceCriteria.join(" "),
    amountNgnKobo: BigInt(stage.amountKobo),
    amountUsdc: BigInt(stage.amountMicro),
    retentionBps: saved.retentionBps ?? 0,
    status: "not_started",
    funded: false,
    onChainIdx: index,
    contractVersionId: created.id,
    kind: stage.kind,
    acceptanceCriteria: stage.acceptanceCriteria,
    tags: stage.tags,
    pour: stage.tags.includes("concrete_pour"),
  })));
  const grid = ((await db.select().from(documents).where(eq(documents.projectId, input.projectId)))[0]?.parsedJson as { rows?: GridRow[] } | null)?.rows ?? [];
  const draft = interpretGrid(grid);
  const items = draft.bills.flatMap((bill) => bill.items.filter((item) => item.rowKind === "item" && item.statedKobo !== null).map((item) => ({
    contractVersionId: created.id,
    billRef: bill.billRef,
    itemRef: item.itemRef || "item",
    description: item.description || bill.title,
    unit: item.unit,
    quantityMilli: item.quantityMilli,
    rateKobo: item.rateKobo,
    amountKobo: item.statedKobo ?? 0n,
    statedAmountKobo: item.statedKobo,
    sourceAnchor: item.anchor,
    confidence: item.confidence,
  })));
  if (items.length > 0) await db.insert(boqItems).values(items);
  await db.update(projects).set({ status: "awaiting_acceptance" }).where(eq(projects.id, input.projectId));
  const replyAt = Date.now();
  await enqueueJob(db, { kind: "contract_reply", payload: { projectId: input.projectId, versionId: created.id, hoursLeft: 48 }, dedupeKey: `reply:${created.id}:24`, runAt: new Date(replyAt + 24 * 3600_000) });
  await enqueueJob(db, { kind: "contract_reply", payload: { projectId: input.projectId, versionId: created.id, hoursLeft: 24 }, dedupeKey: `reply:${created.id}:48`, runAt: new Date(replyAt + 48 * 3600_000) });
  await enqueueJob(db, { kind: "contract_reply", payload: { projectId: input.projectId, versionId: created.id, hoursLeft: 0 }, dedupeKey: `reply:${created.id}:72`, runAt: new Date(replyAt + 72 * 3600_000) });
  await audit(db, { action: "contract.sent", entity: "contract_version", entityId: created.id, projectId: input.projectId, workspaceId: project.workspaceId, actor: input.userId, after: { hash } });
  const named = extraction?.validatedJson as { clientName?: string | null } | null;
  await notifyPlanShared(db, {
    projectId: input.projectId,
    versionId: created.id,
    clientName: named?.clientName || "The client",
    projectName: project.name,
    sumKobo: BigInt(saved.contractSumKobo),
    stageLines: saved.stages.map((stage, index) => `${index + 1}. ${stage.name}: ${stage.amountKobo}`).join("\n"),
    retentionBps: saved.retentionBps ?? 0,
    defectsMonths: Math.round((saved.defectsPeriodDays ?? 180) / 30),
  });
  return { ok: true, versionId: created.id, hash };
}

export async function acceptPlan(
  db: Database,
  input: { projectId: string; userId: string; role: "client" | "contractor"; decision: "accepted" | "change_requested"; reason?: string },
): Promise<{ ok: true; both: boolean; hash: string } | { ok: false; message: string }> {
  if (input.decision === "change_requested" && (input.reason ?? "").trim().length < 10) {
    return { ok: false, message: "Say what should change, in at least 10 characters." };
  }
  const version = (await db.select().from(contractVersions).where(eq(contractVersions.projectId, input.projectId)).orderBy(desc(contractVersions.version)))[0];
  if (!version || version.status !== "pending_acceptance") return { ok: false, message: "There is no plan waiting for agreement." };
  await db.insert(contractAcceptances).values({
    contractVersionId: version.id,
    userId: input.userId,
    role: input.role,
    decision: input.decision,
    reason: input.reason,
    contentHash: version.contentHash,
  });
  if (input.decision === "change_requested") {
    await db.update(contractVersions).set({ status: "draft" }).where(eq(contractVersions.id, version.id));
    await db.update(projects).set({ status: "draft" }).where(eq(projects.id, input.projectId));
    return { ok: true, both: false, hash: version.contentHash };
  }
  const rows = await db.select().from(contractAcceptances).where(eq(contractAcceptances.contractVersionId, version.id));
  const both = rows.some((row) => row.role === "client" && row.decision === "accepted") && rows.some((row) => row.role === "contractor" && row.decision === "accepted");
  if (!both) return { ok: true, both: false, hash: version.contentHash };
  const earlier = (await db.select().from(contractVersions).where(eq(contractVersions.projectId, input.projectId))).filter((row) => row.status === "accepted" && row.id !== version.id);
  for (const row of earlier) await db.update(contractVersions).set({ status: "superseded" }).where(eq(contractVersions.id, row.id));
  await db.update(contractVersions).set({ status: "accepted" }).where(eq(contractVersions.id, version.id));
  await db.update(projects).set({ status: "active", currentContractVersionId: version.id, termsHash: version.contentHash }).where(eq(projects.id, input.projectId));
  await enqueueJob(db, { kind: "accept_terms_deferred", payload: { projectId: input.projectId, versionId: version.id, contentHash: version.contentHash }, dedupeKey: `accept-terms:${version.id}` });
  await audit(db, { action: "contract.accepted", entity: "contract_version", entityId: version.id, projectId: input.projectId, actor: input.userId, after: { hash: version.contentHash } });
  return { ok: true, both: true, hash: version.contentHash };
}

export async function setAwaitingDocuments(db: Database, telegramId: bigint, projectId: string): Promise<void> {
  const expires = new Date(Date.now() + 15 * 60_000);
  await db.insert(botSessions).values({ telegramId, activeProjectId: projectId, state: { mode: "awaiting_documents", projectId }, stateExpiresAt: expires }).onConflictDoUpdate({
    target: botSessions.telegramId,
    set: { activeProjectId: projectId, state: { mode: "awaiting_documents", projectId }, stateExpiresAt: expires, updatedAt: new Date() },
  });
}

export async function awaitingProject(db: Database, telegramId: bigint): Promise<string | null> {
  const row = (await db.select().from(botSessions).where(eq(botSessions.telegramId, telegramId)))[0];
  if (!row?.stateExpiresAt || row.stateExpiresAt.getTime() < Date.now()) return null;
  const state = row.state as { mode?: string; projectId?: string } | null;
  if (state?.mode !== "awaiting_documents" || !state.projectId) return null;
  return state.projectId;
}
