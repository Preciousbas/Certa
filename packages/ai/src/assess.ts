import { decide, StageAssessment, type LanguageModel, type ReleaseDecision } from "./schema.js";

const RULES: { pattern: RegExp; index: number }[] = [
  { pattern: /clearing|setting out/i, index: 0 },
  { pattern: /excavation|footing|blinding/i, index: 1 },
  { pattern: /dpc|oversite|substructure/i, index: 2 },
  { pattern: /ground floor (columns|block)/i, index: 3 },
  { pattern: /first floor slab|formwork|rebar|pour/i, index: 4 },
  { pattern: /first floor columns/i, index: 5 },
  { pattern: /roof|aluminium|aluminum/i, index: 6 },
  { pattern: /plaster|screed|first fix/i, index: 7 },
  { pattern: /tiling|windows|doors/i, index: 8 },
  { pattern: /handover|external works/i, index: 9 },
];

export function heuristicAssess(notes: string): { assessment: StageAssessment; decision: ReleaseDecision } {
  const match = RULES.find((rule) => rule.pattern.test(notes));
  const ambiguous = /maybe|unclear|both/i.test(notes);
  const missingPpe = /no helmet|no PPE|open edge|no guardrail/i.test(notes);
  const confidence = match ? (ambiguous ? 0.55 : 0.9) : 0.4;
  const assessment = StageAssessment.parse({
    stageIndex: match?.index ?? 0,
    completed: Boolean(match) && !ambiguous && !/not started|no concrete/i.test(notes),
    completionPct: match && !ambiguous ? 92 : 40,
    confidence,
    observations: [notes.slice(0, 240)],
    safetyFlags: missingPpe ? ["Missing PPE, an open edge, or no guardrail."] : [],
    missingEvidence: confidence < 0.85 ? ["Closer photos of the work in this stage."] : [],
  });
  return { assessment, decision: decide(assessment) };
}

export async function assessStage(notes: string, model?: LanguageModel, stageNames: string[] = []): Promise<{ assessment: StageAssessment; decision: ReleaseDecision }> {
  if (!model) return heuristicAssess(notes);
  try {
    const raw = await model.assessStage({ notes, stageNames });
    const assessment = StageAssessment.parse(raw);
    return { assessment, decision: decide(assessment) };
  } catch {
    const fallback = heuristicAssess(notes);
    return { assessment: fallback.assessment, decision: "hold" };
  }
}
