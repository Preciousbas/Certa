import { checkPercentages, checkStageTotals, nairaToKobo } from "@certa/shared";
import { ContractSummary, parseSummary, type LanguageModel } from "./schema.js";

export type ParsedContract = { summary: ReturnType<typeof parseSummary>; flags: string[] };

function cells(line: string): string[] {
  if (line.includes("|")) return line.split("|").map((cell) => cell.trim()).filter(Boolean);
  if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
  return [line.trim()];
}

export function summaryFromText(text: string): ParsedContract | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines.findIndex((line) => /stage/i.test(line) && /percent/i.test(line));
  if (header < 0) return null;
  const stages: { name: string; description: string; percentBps: number }[] = [];
  let contractNaira: bigint | null = null;
  let retentionBps = 0;
  let defects = 0;
  let mobilisationBps = 0;
  for (const line of lines.slice(header + 1)) {
    const parts = cells(line);
    const label = parts[0]?.toLowerCase() ?? "";
    if (label.startsWith("contract sum")) {
      contractNaira = BigInt((parts[1] ?? "0").replace(/[^\d]/g, "") || "0");
      continue;
    }
    if (label.startsWith("retention")) {
      retentionBps = Number(parts[1] ?? 0) * 100;
      continue;
    }
    if (label.startsWith("defects")) {
      defects = Number((parts[1] ?? "0").replace(/[^\d]/g, ""));
      continue;
    }
    if (label.startsWith("mobilisation") || label.startsWith("mobilization")) {
      mobilisationBps = Number(parts[1] ?? 0) * 100;
      continue;
    }
    if (parts.length < 3) continue;
    const percent = Number(parts[2]?.replace("%", ""));
    if (!Number.isFinite(percent)) continue;
    stages.push({ name: parts[0] ?? "", description: parts[1] ?? "", percentBps: Math.round(percent * 100) });
  }
  if (!contractNaira || stages.length === 0) return null;
  const sumKobo = nairaToKobo(contractNaira);
  const summary = parseSummary(
    {
      parties: [],
      contractSumKobo: sumKobo.toString(),
      currency: "NGN",
      stages: stages.map((stage) => ({
        name: stage.name,
        description: stage.description,
        percentBps: stage.percentBps,
        amountKobo: ((sumKobo * BigInt(stage.percentBps)) / 10_000n).toString(),
      })),
      retentionBps,
      defectsPeriodDays: defects,
      mobilisationBps,
      deadlines: [],
      paymentTerms: "Stage payments from the locked USDC after the stage is accepted.",
      liquidatedDamages: "",
      ambiguities: [],
    },
    text,
  );
  const flags = [
    ...checkPercentages(stages.map((stage) => stage.percentBps)),
    ...checkStageTotals(
      stages.map((stage) => (sumKobo * BigInt(stage.percentBps)) / 10_000n),
      sumKobo,
    ).flags,
  ];
  return { summary, flags };
}

export async function extractContract(text: string, model?: LanguageModel): Promise<ParsedContract> {
  const deterministic = summaryFromText(text);
  if (deterministic) return deterministic;
  if (!model) throw new Error("No table found and no model is configured.");
  const raw = await model.extractContract(text);
  const summary = parseSummary(raw, text);
  const sum = BigInt(summary.contractSumKobo);
  const amounts = summary.stages.map((stage) => BigInt(stage.amountKobo ?? "0"));
  const flags = checkStageTotals(amounts, sum).flags;
  if (summary.stages.every((stage) => stage.percentBps !== undefined)) {
    flags.push(...checkPercentages(summary.stages.map((stage) => stage.percentBps ?? 0)));
  }
  return { summary, flags };
}

export function validateSummary(summary: unknown): { ok: true } | { ok: false; error: string } {
  const parsed = ContractSummary.safeParse(summary);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid summary" };
  return { ok: true };
}
