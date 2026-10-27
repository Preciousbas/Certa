import { extractContract, parseSummary, sniffDocument, textFromUpload, type LanguageModel, type ParsedContract } from "@certa/ai";
import { digits, mulDivRound } from "../../../src/server/intake/amounts.js";
import { readDocuments } from "../../../src/server/intake/read.js";
import type { ValidatedPlan } from "../../../src/server/intake/validate.js";

const RATE = 150_000n;

function planToParsed(plan: ValidatedPlan): ParsedContract {
  const sum = plan.contractSumKobo ?? 0n;
  const work = plan.stages.filter((stage) => stage.kind !== "reserve");
  const summary = parseSummary({
    parties: [],
    contractSumKobo: sum.toString(),
    currency: "NGN",
    stages: work.map((stage) => ({
      name: stage.name,
      description: stage.acceptanceCriteria.join(" "),
      amountKobo: stage.amountKobo.toString(),
      percentBps: sum > 0n ? digits(((stage.amountKobo * 10_000n) / sum).toString()) : 0,
    })),
    retentionBps: plan.retentionBps,
    defectsPeriodDays: plan.defectsPeriodDays,
    mobilisationBps: 0,
    deadlines: work.flatMap((stage) => (stage.expectedFinish ? [stage.expectedFinish] : [])),
    paymentTerms: plan.basis === "contract_milestones" ? "Stages come from the contract's payment schedule." : "Stages come from the bills in your BoQ.",
    liquidatedDamages: "",
    ambiguities: plan.issues.filter((issue) => issue.severity !== "blocking").map((issue) => issue.message),
  });
  return { summary, flags: plan.issues.filter((issue) => issue.severity === "blocking").map((issue) => issue.message) };
}

function checkedExtraction(parsed: ParsedContract): ParsedContract {
  const sum = BigInt(parsed.summary.contractSumKobo);
  const stages = parsed.summary.stages.map((stage) => {
    if (stage.percentBps === undefined || stage.amountKobo) return stage;
    return { ...stage, amountKobo: mulDivRound(sum, BigInt(stage.percentBps), 10_000n).toString() };
  });
  const flags = [...parsed.flags];
  if (stages.some((stage) => !stage.name.trim())) flags.push("A stage has no name.");
  if (stages.some((stage) => !stage.amountKobo || BigInt(stage.amountKobo) === 0n)) flags.push("A stage has no amount.");
  const total = stages.reduce((acc, stage) => acc + BigInt(stage.amountKobo ?? "0"), 0n);
  if (total !== sum) flags.push("The stage amounts do not add up to the contract sum.");
  const pct = stages.reduce((acc, stage) => acc + (stage.percentBps ?? 0), 0);
  if (stages.some((stage) => stage.percentBps !== undefined) && pct !== 10_000) flags.push("The schedule percentages do not add up to 100%.");
  return { summary: { ...parsed.summary, stages }, flags };
}

export async function studyDocuments(filename: string, bytes: Uint8Array, model?: LanguageModel): Promise<ParsedContract> {
  const kind = sniffDocument(filename, bytes);
  if (kind === "heic") throw new Error("Send a JPEG or PNG photo of the page.");
  if (kind === "jpeg" || kind === "png") throw new Error("Send the Excel bill or a PDF. A photo of the page is not read yet.");
  if (!kind) throw new Error("That file is not a PDF, Word, Excel, or CSV.");
  const { plan } = await readDocuments([{ name: filename, bytes }], RATE);
  const work = plan.stages.filter((stage) => stage.kind !== "reserve");
  if (work.length === 0) {
    const text = await textFromUpload(filename, bytes);
    return checkedExtraction(await extractContract(text, model));
  }
  return planToParsed(plan);
}
