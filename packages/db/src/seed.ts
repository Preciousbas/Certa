import { eq } from "drizzle-orm";
import {
  DEMO_CAP_NAIRA,
  DEMO_CONTRACT_NAIRA,
  DEMO_DEFECTS_DAYS,
  DEMO_FX_NAIRA_PER_USDC,
  DEMO_GEOFENCE_M,
  DEMO_MOBILISATION_BPS,
  DEMO_RETENTION_BPS,
  DEMO_STAGES,
  applyBps,
  fxRateFromNaira,
  nairaToKobo,
  usdcFromNgnKobo,
} from "@certa/shared";
import type { Database } from "./client.js";
import { encryptEmail } from "./services.js";
import {
  changeRequests,
  contractSummaries,
  disputes,
  parties,
  projects,
  stages,
  submissions,
  users,
  workspaceMembers,
  workspaces,
} from "./schema.js";

function chainAddress(name: string, fallback: string): string {
  const value = process.env[name] ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value : fallback;
}

export async function seedDemo(db: Database) {
  const existing = await db
    .select()
    .from(projects)
    .where(eq(projects.name, "EM 22 — 4-Bedroom Duplex, Lekki Phase 1, Lagos"));
  if (existing[0]) return { projectId: existing[0].id, created: false };

  const rate = fxRateFromNaira(DEMO_FX_NAIRA_PER_USDC);
  const sumKobo = nairaToKobo(DEMO_CONTRACT_NAIRA);
  const sumUsdc = usdcFromNgnKobo(sumKobo, rate);

  const [client] = await db
    .insert(users)
    .values({
      telegramId: 1001n,
      name: "Zanzibar Estates Ltd",
      emailCiphertext: encryptEmail("client@zanzibar.example"),
    })
    .returning();
  const [consultant] = await db
    .insert(users)
    .values({
      telegramId: 1002n,
      name: "Engr. A. Okafor",
      emailCiphertext: encryptEmail("okafor@bassey.example"),
    })
    .returning();
  const [main] = await db
    .insert(users)
    .values({ telegramId: 1003n, name: "Kemfor Construction Ltd" })
    .returning();
  const [sub] = await db
    .insert(users)
    .values({
      telegramId: 1004n,
      name: "Danjuma Concrete Works",
      emailCiphertext: encryptEmail("danjuma@concrete.example"),
    })
    .returning();
  if (!client || !consultant || !main || !sub) throw new Error("seed users failed");

  const [workspace] = await db
    .insert(workspaces)
    .values({
      ownerUserId: client.id,
      name: "Bassey Engineering Consult",
      company: "Bassey Engineering Consult",
      gasAllowanceUsdc: 5_000_000n,
      x402AllowanceUsdc: 2_000_000n,
      marginTop: 92,
      marginBottom: 78,
      isDemo: true,
    })
    .returning();
  if (!workspace) throw new Error("seed workspace failed");
  await db.insert(workspaceMembers).values([
    { workspaceId: workspace.id, userId: client.id, role: "owner" },
    { workspaceId: workspace.id, userId: consultant.id, role: "consultant" },
  ]);

  const [project] = await db
    .insert(projects)
    .values({
      workspaceId: workspace.id,
      name: "EM 22 — 4-Bedroom Duplex, Lekki Phase 1, Lagos",
      siteLocation: "Lekki Phase 1, Lagos",
      siteLat: 6.4474,
      siteLng: 3.4723,
      geofenceRadiusM: DEMO_GEOFENCE_M,
      status: "active",
      fxRateLocked: rate,
      fxSource: "contract acceptance",
      fxLockedAt: new Date("2026-08-01T09:00:00Z"),
      escrowAddress: /^0x[a-fA-F0-9]{40}$/.test(process.env.ESCROW_ADDRESS ?? "")
        ? process.env.ESCROW_ADDRESS
        : null,
      spendingCapUsdc: usdcFromNgnKobo(nairaToKobo(DEMO_CAP_NAIRA), rate),
      retentionBps: DEMO_RETENTION_BPS,
      defectsPeriodDays: DEMO_DEFECTS_DAYS,
      mobilisationBps: DEMO_MOBILISATION_BPS,
      contractSumKobo: sumKobo,
      contractSumUsdc: sumUsdc,
      termsHash: "seeded-terms",
    })
    .returning();
  if (!project) throw new Error("seed project failed");

  const partyRows = await db
    .insert(parties)
    .values([
      {
        projectId: project.id,
        workspaceId: workspace.id,
        userId: client.id,
        role: "client",
        walletAddress: chainAddress("CLIENT_ADDRESS", "0x1111111111111111111111111111111111111111"),
        cdpWalletId: chainAddress("CLIENT_ADDRESS", "") ? "sepolia:client" : "mock:client",
        walletMock: !chainAddress("CLIENT_ADDRESS", ""),
        emailVerified: true,
        notificationEmails: [encryptEmail("accounts@zanzibar.example")],
      },
      {
        projectId: project.id,
        workspaceId: workspace.id,
        userId: consultant.id,
        role: "consultant",
        emailVerified: true,
      },
      {
        projectId: project.id,
        workspaceId: workspace.id,
        userId: main.id,
        role: "main_contractor",
        canViewSubs: true,
        walletAddress: chainAddress(
          "CONTRACTOR_ADDRESS",
          "0x2222222222222222222222222222222222222222",
        ),
        cdpWalletId: chainAddress("CONTRACTOR_ADDRESS", "") ? "sepolia:contractor" : "mock:main",
        walletMock: !chainAddress("CONTRACTOR_ADDRESS", ""),
      },
      {
        projectId: project.id,
        workspaceId: workspace.id,
        userId: sub.id,
        role: "subcontractor",
        walletAddress: "0x3333333333333333333333333333333333333333",
        cdpWalletId: "mock:sub",
        walletMock: true,
        emailVerified: true,
        notificationEmails: [encryptEmail("danjuma@concrete.example")],
      },
    ])
    .returning();
  const subParty = partyRows.find((row) => row.role === "subcontractor");
  if (!subParty) throw new Error("seed party failed");

  const stageRows = await db
    .insert(stages)
    .values(
      DEMO_STAGES.map((stage, index) => {
        const amountKobo = applyBps(sumKobo, BigInt(stage.bps));
        const released = index < 4;
        return {
          projectId: project.id,
          workspaceId: workspace.id,
          stageIndex: index,
          name: stage.name,
          description: stage.description,
          amountNgnKobo: amountKobo,
          amountUsdc: usdcFromNgnKobo(amountKobo, rate),
          retentionBps: DEMO_RETENTION_BPS,
          status: released ? "released" : index === 4 ? "submitted" : "not_started",
          funded: true,
          onChainIdx: index,
          assignedPartyId: subParty.id,
          pour: stage.pour,
        };
      }),
    )
    .returning();
  const slab = stageRows.find((row) => row.stageIndex === 4);
  const foundation = stageRows.find((row) => row.stageIndex === 1);
  if (!slab || !foundation) throw new Error("seed stages failed");

  await db.insert(submissions).values({
    stageId: slab.id,
    projectId: project.id,
    workspaceId: workspace.id,
    submittedBy: sub.id,
    confidence: 0.78,
    decision: "consultant_review",
    aiAssessmentJson: {
      stageIndex: 4,
      completed: false,
      completionPct: 80,
      confidence: 0.78,
      observations: ["Formwork and rebar are in place. The pour has not started."],
      safetyFlags: [],
      missingEvidence: ["Photo after the pour, with the slab surface visible."],
    },
    evidenceHash: "0xseed",
  });

  await db.insert(disputes).values({
    stageId: foundation.id,
    projectId: project.id,
    workspaceId: workspace.id,
    raisedBy: client.id,
    reason: "Blinding thickness looked short on the first photos.",
    status: "resolved",
    deadlineAt: new Date("2026-09-01T00:00:00Z"),
    resolution: {
      payBps: 10000,
      note: "Follow-up photos confirmed the blinding. Released in full.",
    },
  });

  await db.insert(changeRequests).values({
    projectId: project.id,
    workspaceId: workspace.id,
    type: "new_stage",
    beforeJson: { stages: DEMO_STAGES.length },
    afterJson: { name: "Extra soakaway", amountNgnKobo: nairaToKobo(900_000n).toString() },
    requestedBy: client.id,
    status: "pending",
  });

  await db.insert(contractSummaries).values({
    projectId: project.id,
    workspaceId: workspace.id,
    version: 1,
    json: { contractSumKobo: sumKobo.toString(), stages: DEMO_STAGES.length },
    hash: "seeded-terms",
    acceptedByClientAt: new Date("2026-08-01T09:00:00Z"),
    acceptedByContractorAt: new Date("2026-08-01T11:30:00Z"),
  });

  return { projectId: project.id, created: true };
}
