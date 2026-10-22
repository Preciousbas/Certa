export type Criterion = { id: string; text: string; required: boolean };

export function criteriaOf(value: unknown): Criterion[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ id: "c1", text: "The photos show this stage of the work.", required: true }];
  }
  const rows = value.flatMap((item, index): Criterion[] => {
    if (typeof item === "string" && item.trim()) {
      return [{ id: `c${index + 1}`, text: item.trim(), required: true }];
    }
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; text?: unknown; required?: unknown };
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!text) return [];
    return [
      {
        id: typeof row.id === "string" && row.id ? row.id : `c${index + 1}`,
        text,
        required: row.required !== false,
      },
    ];
  });
  return rows.length > 0 ? rows : [{ id: "c1", text: "The photos show this stage of the work.", required: true }];
}

export function requiredMet(criteria: readonly Criterion[], results: readonly { id: string; result: string }[]): boolean {
  return criteria
    .filter((item) => item.required)
    .every((item) => results.some((result) => result.id === item.id && result.result === "met"));
}
