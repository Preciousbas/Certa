/** Exact one-line tooltips from 01 §3. */
export const TOOLTIPS = {
  "BoQ (bill of quantities)": "The priced list of every item of work, with quantity, unit and rate.",
  "Contract sum": "The total agreed price for the whole job, including VAT if the contract says so.",
  Stage: "A part of the job that is paid for when it is finished, for example \"First floor slab\".",
  "Acceptance criteria": "What must be visible in the photos before a stage can be paid.",
  Valuation: "A measurement of how much work has been done, used to decide how much to pay.",
  Retention: "A small part of each payment (usually 5%) kept back until the defects period ends.",
  "Defects liability period": "The time after completion when the contractor must fix faults for free. Retention is paid after it ends.",
  "Mobilisation advance": "Money paid at the start so the contractor can set up site. It is recovered from later payments.",
  Variation: "A change to the work (added, removed or altered) agreed by both sides, with its own price.",
  "Provisional sum": "Money set aside for work that is not fully designed yet. It is only spent with approval.",
  Contingency: "A reserve for unexpected work. It is only spent through an agreed variation.",
  "Liquidated damages (LD)": "A fixed amount the contractor pays per day or week of late completion, as set in the contract.",
  Locked: "The money is in the escrow and cannot be moved until this stage is approved.",
  "In review": "Photos were sent for this stage and are waiting for the AI check or an approval.",
  Released: "The money for this stage has been paid to the contractor. The payment link proves it.",
  Confidence: "How sure the AI is about its verdict, from 0% to 100%. Below 75% a person must check.",
  "Spending cap": "The largest payment Certa can release without the client pressing Approve.",
  Escrow: "A locked account on the blockchain that only pays out under the agreed rules.",
  USDC: "A digital dollar. 1 USDC is worth about 1 US dollar. Certa uses it to hold the money.",
  "Exchange rate": "The naira price of 1 USDC that Certa uses on every screen. The date shows when it was set.",
  "Weather check": "Before a concrete pour, Certa buys a weather forecast so concrete is not poured into rain.",
  Gas: "A small network fee for each blockchain payment. Certa pays it from your plan; you never buy it.",
  "Workspace allowance": "The amount your plan covers each month for network fees and checks Certa pays for.",
  "Release fee": "Certa's fee of 0.5% of each payment released.",
  Dispute: "A formal disagreement about a stage. The money stays locked until it is settled.",
  "Join code": "A short code that lets someone join one project only.",
} as const;

export type TooltipTerm = keyof typeof TOOLTIPS;

export function tooltipText(term: TooltipTerm): string {
  return TOOLTIPS[term];
}
