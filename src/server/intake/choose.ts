export type ChooseRow = {
  id: string;
  sha256: string;
  status: string;
  parseStatus?: string | null;
  createdAt: Date;
  parsedJson?: unknown;
};

export function readSucceeded(row: { status: string; parseStatus?: string | null }): boolean {
  return row.status === "parsed" || row.parseStatus === "parsed";
}

function newestFirst<T extends { createdAt: Date; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
}

function parsedBody(row: ChooseRow): string | null {
  const parsed = row.parsedJson as { rows?: unknown[] } | null;
  if (!parsed?.rows || parsed.rows.length === 0) return null;
  return JSON.stringify(parsed);
}

/** One document per sha256: the newest copy that was read successfully. Identical parsed sheets stored under different hashes count once. */
export function chooseDocuments<T extends ChooseRow>(rows: T[]): T[] {
  const byHash = new Map<string, T[]>();
  for (const row of rows) {
    const group = byHash.get(row.sha256) ?? [];
    group.push(row);
    byHash.set(row.sha256, group);
  }
  const picked: T[] = [];
  for (const group of byHash.values()) {
    const newest = newestFirst(group.filter(readSucceeded))[0];
    if (newest) picked.push(newest);
  }
  const seen = new Set<string>();
  const chosen: T[] = [];
  for (const row of newestFirst(picked)) {
    const body = parsedBody(row);
    if (body) {
      if (seen.has(body)) continue;
      seen.add(body);
    }
    chosen.push(row);
  }
  return chosen;
}
