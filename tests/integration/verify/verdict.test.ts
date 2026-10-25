import { aiVerdicts, createMemoryDatabase, memberships, photos, stages, submissions, users, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { startOwnProject } from "@certa/db";
import { evidenceHash } from "../../../src/server/verify/evidence.js";
import { runVerifyStage } from "../../../src/server/verify/run.js";
import type { VisionClient } from "../../../src/server/verify/vision.js";

const bad: VisionClient = async () => ({ text: "not json", latencyMs: 5, costMicro: null });

async function ready(db: Database) {
  const started = await startOwnProject(db, { telegramId: 88001n, name: "Ada", projectName: "Gate house", role: "client" });
  const [contractor] = await db.insert(users).values({ telegramId: 88002n, name: "Kemfor" }).returning();
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
      name: "Oversite",
      amountNgnKobo: 1000n,
      amountUsdc: 1n,
      retentionBps: 0,
      status: "ai_review",
      funded: true,
      onChainIdx: 0,
      acceptanceCriteria: ["Blinding covers the excavation"],
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
      checksJson: { nonce_ok: true, fresh: true, in_radius: true, exif_present: false, not_duplicate: true, image_ok: true },
      distanceFromSiteM: 12,
      capturedAt: new Date(),
    });
  }
  return { stage: stage!, submission: submission! };
}

describe("verify stage job", () => {
  it("stores a bad model reply and moves the stage to needs_more_evidence", async () => {
    const opened = await createMemoryDatabase();
    const { stage, submission } = await ready(opened.db);
    const decision = await runVerifyStage(opened.db, submission.id, { client: bad });
    expect(decision?.next).toBe("needs_more_evidence");
    const stored = (await opened.db.select().from(stages).where(eq(stages.id, stage.id)))[0];
    expect(stored?.status).toBe("needs_more_evidence");
    const again = await runVerifyStage(opened.db, submission.id, { client: bad });
    expect(again?.next).toBe("needs_more_evidence");
    await opened.close();
  });

  it("submits the stage on a pass and does not release", async () => {
    const opened = await createMemoryDatabase();
    const { stage, submission } = await ready(opened.db);
    const calls: string[] = [];
    let callsToModel = 0;
    const client: VisionClient = async () => {
      callsToModel += 1;
      return {
        text: JSON.stringify({
          schema_version: "3",
          stage_number_claimed: 1,
          items: [{ id: "c1", answer: "yes", reason: "Blinding covers the excavation." }],
        }),
        latencyMs: 4,
        costMicro: null,
      };
    };
    const decision = await runVerifyStage(opened.db, submission.id, {
      client,
      submit: async (_db, input) => {
        calls.push(input.evidenceHash);
        return { txHash: "0x" + "ab".repeat(32) };
      },
    });
    expect(decision?.next).toBe("awaiting_certification");
    expect(callsToModel).toBe(2);
    expect(calls).toHaveLength(1);
    const stored = (await opened.db.select().from(stages).where(eq(stages.id, stage.id)))[0];
    expect(stored?.status).toBe("awaiting_certification");
    await opened.close();
  });

  it("stores an unsure verdict when the vision call times out", async () => {
    const opened = await createMemoryDatabase();
    const { stage, submission } = await ready(opened.db);
    const client: VisionClient = async () => {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    };
    const decision = await runVerifyStage(opened.db, submission.id, { client });
    expect(decision?.next).toBe("needs_more_evidence");
    const stored = (await opened.db.select().from(stages).where(eq(stages.id, stage.id)))[0];
    expect(stored?.status).toBe("needs_more_evidence");
    const verdict = (await opened.db.select().from(aiVerdicts).where(eq(aiVerdicts.submissionId, submission.id)))[0];
    expect(verdict?.verdict).toBe("unsure");
    await opened.close();
  });
});
