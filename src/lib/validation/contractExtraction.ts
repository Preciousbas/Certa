import { z } from "zod";

const Source = z.object({ document_id: z.string().uuid(), anchor: z.string().min(1), quote: z.string().max(200) }).strict();
const Field = <T extends z.ZodTypeAny>(value: T) => z.object({ value: value.nullable(), confidence: z.number().min(0).max(1), source: Source.nullable() }).strict();
const Money = z.string().regex(/^\d{1,13}\.\d{2}$/);
const Pct = z.string().regex(/^\d{1,2}(\.\d{1,2})?$/);
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Party = z.object({ name: Field(z.string()), address: Field(z.string()), email: Field(z.string().email()), phone: Field(z.string()) }).strict();

export const ContractExtraction = z.object({
  schema_version: z.literal("1"),
  currency: Field(z.enum(["NGN", "USD"])),
  parties: z.object({ client: Party, contractor: Party, consultant: Party.nullable() }).strict(),
  project: z.object({
    name: Field(z.string()),
    location: Field(z.string()),
    description: Field(z.string()),
    start_date: Field(DateStr),
    completion_date: Field(DateStr),
    duration_weeks: Field(z.number().int()),
    defects_liability_months: Field(z.number().int().min(0).max(24)),
  }).strict(),
  sums: z.object({
    contract_sum: Field(Money),
    contract_sum_includes_vat: Field(z.boolean()),
    vat_rate_pct: Field(Pct),
    vat_amount: Field(Money),
    preliminaries: Field(Money),
    provisional_sums: z.array(z.object({ label: z.string(), amount: Field(Money) }).strict()),
    prime_cost_sums: z.array(z.object({ label: z.string(), amount: Field(Money) }).strict()),
    contingency: Field(Money),
    contingency_pct: Field(Pct),
  }).strict(),
  boq: z.object({
    bills: z.array(z.object({
      bill_ref: z.string(),
      title: z.string(),
      items: z.array(z.object({
        item_ref: z.string(),
        description: z.string(),
        unit: z.string().nullable(),
        quantity: z.string().nullable(),
        rate: Money.nullable(),
        amount: Money.nullable(),
        row_kind: z.enum(["item", "heading", "note", "subtotal"]),
        confidence: z.number().min(0).max(1),
        source: Source,
      }).strict()),
      stated_subtotal: Field(Money),
    }).strict()),
    stated_grand_total: Field(Money),
  }).strict().nullable(),
  payment_terms: z.object({
    method: Field(z.enum(["milestones", "interim_valuation", "mixed"])),
    payment_period_days: Field(z.number().int()),
    advance_amount: Field(Money),
    advance_pct: Field(Pct),
    advance_recovery: Field(z.string()),
    retention_pct: Field(Pct),
    retention_release: Field(z.string()),
    ld_amount: Field(Money),
    ld_period: Field(z.enum(["day", "week"])),
    ld_cap_pct: Field(Pct),
    fluctuation_clause: Field(z.string()),
    variation_procedure: Field(z.string()),
    milestones: z.array(z.object({ name: z.string(), pct: Pct.nullable(), amount: Money.nullable(), source: Source }).strict()),
  }).strict(),
  stages_proposal: z.object({
    basis: z.enum(["contract_milestones", "boq_grouping"]),
    stages: z.array(z.object({
      number: z.number().int().min(1),
      name: z.string().min(3).max(80),
      kind: z.enum(["mobilisation", "work"]),
      bill_refs: z.array(z.string()),
      milestone_amount: Money.nullable(),
      acceptance_criteria: z.array(z.string().min(15).max(200)).min(3).max(6),
      tags: z.array(z.enum(["concrete_pour", "reinforcement", "blockwork", "roofing", "plastering", "tiling", "electrical", "plumbing", "external"])),
    }).strict()).min(1).max(30),
    reserve: z.object({ includes: z.array(z.enum(["provisional_sums", "prime_cost_sums", "contingency"])) }).strict(),
  }).strict(),
  issues: z.array(z.object({ code: z.string(), message: z.string(), anchor: z.string().nullable() }).strict()),
}).strict();

export function contractExtractionJsonSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "currency", "parties", "project", "sums", "payment_terms", "stages_proposal", "issues"],
    properties: { schema_version: { const: "1" } },
  };
}
