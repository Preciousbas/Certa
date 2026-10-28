import {
  aiVerdicts,
  createMemoryDatabase,
  memberships,
  photos,
  stages,
  startOwnProject,
  submissions,
  users,
  type Database,
} from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { evidenceHash } from "./evidence.js";
import { runVerifyStage } from "./run.js";
import type { VisionClient } from "./vision.js";

vi.mock("../storage.js", () => ({ getObject: async () => null }));

const CRITERIA = [
  "The trench is open in the foreground.",
  "The concrete base fills the trench.",
  "The reinforcement sits in the concrete.",
  "The formwork is still in place.",
  "The site is not a finished floor.",
  "Daylight shows the work clearly.",
];

async function ready(db: Database) {
  const started = await startOwnProject(db, {
    telegramId: 88011n,
    name: "Ada",
    projectName: "Gate house",
    role: "client",
  });
  const [contractor] = await db
    .insert(users)
    .values({ telegramId: 88012n, name: "Kemfor" })
    .returning();
  await db.insert(memberships).values([
    { projectId: started.projectId, userId: contractor!.id, role: "contractor" },
    { projectId: started.projectId, userId: started.userId, role: "consultant" },
  ]);
  const [stage] = await db
    .insert(stages)
    .values({
      projectId: started.projectId,
      workspaceId: started.workspaceId,
      stageIndex: 0,
      name: "Foundation",
      amountNgnKobo: 1000n,
      amountUsdc: 1n,
      retentionBps: 0,
      status: "ai_review",
      funded: true,
      onChainIdx: 0,
      acceptanceCriteria: CRITERIA,
    })
    .returning();
  const hashes = ["aa", "bb", "cc"];
  const [submission] = await db
    .insert(submissions)
    .values({
      stageId: stage!.id,
      projectId: started.projectId,
      workspaceId: started.workspaceId,
      submittedBy: contractor!.id,
      evidenceHash: evidenceHash(stage!.id, hashes),
      status: "verifying",
    })
    .returning();
  for (const hash of hashes) {
    await db.insert(photos).values({
      submissionId: submission!.id,
      projectId: started.projectId,
      workspaceId: started.workspaceId,
      stageId: stage!.id,
      storageKey: `mem/${hash}.jpg`,
      sha256: hash,
      phash: hash.padEnd(16, "0"),
      checksJson: {
        nonce_ok: true,
        fresh: true,
        in_radius: true,
        exif_present: false,
        not_duplicate: true,
        image_ok: true,
      },
      distanceFromSiteM: 12,
      capturedAt: new Date(),
    });
  }
  return { stage: stage!, submission: submission! };
}

function yesClient(): { client: VisionClient; calls: () => number } {
  let calls = 0;
  const client: VisionClient = async () => {
    calls += 1;
    return {
      text: JSON.stringify({
        schema_version: "3",
        stage_number_claimed: 1,
        items: CRITERIA.map((_, index) => ({
          id: `c${index + 1}`,
          answer: "yes",
          reason: "Seen in the foreground.",
        })),
      }),
      latencyMs: 4,
      costMicro: null,
    };
  };
  return { client, calls: () => calls };
}

describe("six-criteria checklist", () => {
  it("passes a six-criteria stage when every item is seen", async () => {
    const opened = await createMemoryDatabase();
    const { submission } = await ready(opened.db);
    const vision = yesClient();
    const submitted: unknown[] = [];
    const decision = await runVerifyStage(opened.db, submission.id, {
      client: vision.client,
      submit: async (_db, input) => {
        submitted.push(input);
        return { txHash: null };
      },
    });
    expect(decision?.next).toBe("awaiting_certification");
    expect(vision.calls()).toBe(2);
    expect(submitted).toHaveLength(1);
    const stored = (
      await opened.db.select().from(aiVerdicts).where(eq(aiVerdicts.submissionId, submission.id))
    )[0];
    expect(stored?.verdict).toBe("pass");
    expect(stored?.criteriaResults).toHaveLength(6);
    await opened.close();
  });

  it("stores the checklist question with each answer", async () => {
    const opened = await createMemoryDatabase();
    const { submission } = await ready(opened.db);
    const vision = yesClient();
    await runVerifyStage(opened.db, submission.id, {
      client: vision.client,
      submit: async () => ({ txHash: null }),
    });
    const stored = (await opened.db.select().from(aiVerdicts).where(eq(aiVerdicts.submissionId, submission.id)))[0];
    const rows = stored?.criteriaResults as { text?: string }[];
    expect(rows.map((row) => row.text)).toEqual([...CRITERIA]);
    await opened.close();
  });
});
