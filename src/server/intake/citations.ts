import type { BoqDraft } from "./interpret.js";

export function normalise(text: string): string {
  return text.toLowerCase().replace(/[\s,₦]/g, "");
}

export type CitationGap = {
  code: "V14";
  rule: "citation";
  severity: "blocking";
  message: string;
  anchor: string | null;
  quote: string | null;
  field: string;
  value: string;
};

function hasPlace(anchor: string | null): boolean {
  if (!anchor) return false;
  return anchor.includes("!") || /p\d+/.test(anchor) || anchor.includes("para");
}

function cited(quote: string | null, anchor: string | null, chunks: { content: string }[]): boolean {
  if (!quote || !hasPlace(anchor)) return false;
  return chunks.some((chunk) => citationHolds(quote, chunk.content, null));
}

export function citationIssues(draft: BoqDraft, chunks: { anchor: string; content: string }[]): CitationGap[] {
  const gaps: CitationGap[] = [];
  const add = (field: string, value: string, quote: string | null, anchor: string | null) => {
    if (cited(quote, anchor, chunks)) return;
    gaps.push({
      code: "V14",
      rule: "citation",
      severity: "blocking",
      message: `${field} has no source quote or page, so it cannot be checked against the document.`,
      anchor,
      quote,
      field,
      value,
    });
  };
  if (draft.contractSumKobo !== null) add("Contract sum", draft.contractSumKobo.toString(), draft.contractSumQuote, draft.contractSumAnchor);
  if (draft.vatKobo !== null) add("VAT", draft.vatKobo.toString(), draft.vatQuote, draft.vatAnchor);
  for (const bill of draft.bills) {
    for (const item of bill.items) {
      if (item.rowKind !== "item" || item.statedKobo === null) continue;
      add(item.description || item.itemRef || "Item", item.statedKobo.toString(), item.quote, item.anchor);
    }
  }
  return gaps;
}

export function citationHolds(quote: string, content: string, value: string | null): boolean {
  if (!normalise(content).includes(normalise(quote))) return false;
  if (!value) return true;
  return normalise(quote).includes(normalise(value));
}
