import { formatQty, moneyString, pctFromBps } from "./amounts.js";
import type { BoqDraft } from "./interpret.js";
import type { ValidatedPlan } from "./validate.js";
import { ContractExtraction } from "../../lib/validation/contractExtraction.js";

const DOC = "00000000-0000-4000-8000-000000000001";

function blank<T>(value: T | null = null) {
  return { value, confidence: value === null ? 0 : 0.97, source: null };
}

function cited(value: string | null, anchor: string | null, quote: string | null, documentId: string) {
  if (value === null || !anchor || !quote) return { value, confidence: value === null ? 0 : 0.4, source: null };
  return {
    value,
    confidence: 0.97,
    source: { document_id: documentId, anchor, quote: quote.slice(0, 200) },
  };
}

export function extractionFromDraft(draft: BoqDraft, plan: ValidatedPlan, documentId = DOC) {
  const money = (kobo: bigint | null, anchor: string | null, quote: string | null) =>
    cited(kobo === null ? null : moneyString(kobo), anchor, quote ?? (kobo === null ? null : moneyString(kobo)), documentId);
  const party = (name: string | null) => ({
    name: cited(name, name ? "parties" : null, name, documentId),
    address: blank<string>(),
    email: blank<string>(),
    phone: blank<string>(),
  });
  const proposal = plan.stages.filter((stage) => stage.kind !== "reserve");
  const includes: ("provisional_sums" | "prime_cost_sums" | "contingency")[] = [];
  if (draft.provisional.length > 0) includes.push("provisional_sums");
  if (draft.primeCost.length > 0) includes.push("prime_cost_sums");
  if (draft.contingencyKobo) includes.push("contingency");
  const built = {
    schema_version: "1" as const,
    currency: cited(draft.currency, draft.contractSumAnchor, draft.currency, documentId),
    parties: {
      client: party(draft.clientName),
      contractor: party(draft.contractorName),
      consultant: draft.consultantName ? party(draft.consultantName) : null,
    },
    project: {
      name: cited(draft.projectName, draft.projectName ? "project" : null, draft.projectName, documentId),
      location: cited(draft.location, draft.location ? "location" : null, draft.location, documentId),
      description: blank<string>(),
      start_date: cited(draft.startDate, draft.startDate ? "dates" : null, draft.startDate, documentId),
      completion_date: cited(draft.completionDate, draft.completionDate ? "dates" : null, draft.completionDate, documentId),
      duration_weeks: blank<number>(),
      defects_liability_months: {
        value: draft.defectsMonths,
        confidence: draft.defectsMonths === null ? 0 : 0.97,
        source: draft.defectsMonths === null ? null : { document_id: documentId, anchor: "dates", quote: `${draft.defectsMonths}-month` },
      },
    },
    sums: {
      contract_sum: money(draft.contractSumKobo, draft.contractSumAnchor, draft.contractSumQuote),
      contract_sum_includes_vat: { value: draft.includesVat, confidence: 0.97, source: null },
      vat_rate_pct: cited(draft.vatBps === null ? null : pctFromBps(draft.vatBps), draft.vatAnchor, draft.vatBps === null ? null : pctFromBps(draft.vatBps), documentId),
      vat_amount: money(draft.vatKobo, draft.vatAnchor, draft.vatQuote),
      preliminaries: money(draft.preliminariesKobo, null, null),
      provisional_sums: draft.provisional.map((row) => ({ label: row.label, amount: money(row.kobo, row.anchor, row.quote) })),
      prime_cost_sums: draft.primeCost.map((row) => ({ label: row.label, amount: money(row.kobo, row.anchor, row.quote) })),
      contingency: money(draft.contingencyKobo, draft.contingencyAnchor, draft.contingencyKobo === null ? null : moneyString(draft.contingencyKobo)),
      contingency_pct: cited(draft.contingencyBps === null ? null : pctFromBps(draft.contingencyBps), draft.contingencyAnchor, draft.contingencyBps === null ? null : pctFromBps(draft.contingencyBps), documentId),
    },
    boq: {
      bills: draft.bills.map((bill) => ({
        bill_ref: bill.billRef,
        title: bill.title,
        items: bill.items
          .filter((item) => item.rowKind === "item" || item.rowKind === "subtotal")
          .map((item) => ({
            item_ref: item.itemRef || "subtotal",
            description: item.description || bill.title,
            unit: item.unit,
            quantity: item.quantityMilli === null ? null : formatQty(item.quantityMilli),
            rate: item.rateKobo === null ? null : moneyString(item.rateKobo),
            amount: item.statedKobo === null ? null : moneyString(item.statedKobo),
            row_kind: item.rowKind,
            confidence: item.confidence,
            source: { document_id: documentId, anchor: item.anchor, quote: (item.quote || item.description || bill.title).slice(0, 200) },
          })),
        stated_subtotal: money(bill.statedSubtotalKobo, bill.anchor, bill.statedSubtotalKobo === null ? null : moneyString(bill.statedSubtotalKobo)),
      })),
      stated_grand_total: money(draft.statedGrandKobo, null, null),
    },
    payment_terms: {
      method: cited(plan.basis === "contract_milestones" ? "milestones" : "interim_valuation", "terms", plan.basis, documentId),
      payment_period_days: { value: draft.paymentPeriodDays, confidence: draft.paymentPeriodDays === null ? 0 : 0.97, source: null },
      advance_amount: money(draft.advanceKobo, null, null),
      advance_pct: cited(draft.advanceBps === null ? null : pctFromBps(draft.advanceBps), null, null, documentId),
      advance_recovery: cited(draft.advanceRecovery, null, null, documentId),
      retention_pct: cited(draft.retentionBps === null ? null : pctFromBps(draft.retentionBps), "terms", draft.retentionRelease, documentId),
      retention_release: cited(draft.retentionRelease, draft.retentionRelease ? "terms" : null, draft.retentionRelease, documentId),
      ld_amount: money(draft.ldRateKobo, null, null),
      ld_period: cited(draft.ldPeriod, null, null, documentId),
      ld_cap_pct: cited(draft.ldCapBps === null ? null : pctFromBps(draft.ldCapBps), null, null, documentId),
      fluctuation_clause: blank<string>(),
      variation_procedure: blank<string>(),
      milestones: draft.milestones.map((milestone) => ({
        name: milestone.name,
        pct: milestone.pctBps === null ? null : pctFromBps(milestone.pctBps),
        amount: milestone.amountKobo === null ? null : moneyString(milestone.amountKobo),
        source: { document_id: documentId, anchor: milestone.anchor, quote: milestone.quote.slice(0, 200) },
      })),
    },
    stages_proposal: {
      basis: plan.basis,
      stages: (proposal.length > 0 ? proposal : plan.stages).slice(0, 30).map((stage) => ({
        number: stage.number,
        name: stage.name.slice(0, 80),
        kind: stage.kind === "mobilisation" ? ("mobilisation" as const) : ("work" as const),
        bill_refs: stage.billRefs,
        milestone_amount: null,
        acceptance_criteria: stage.acceptanceCriteria.slice(0, 6),
        tags: stage.tags,
      })),
      reserve: { includes },
    },
    issues: plan.issues.map((issue) => ({ code: issue.code, message: issue.message, anchor: issue.anchor })),
  };
  return ContractExtraction.parse(built);
}
