/** 1 uses the singular. Every other count, including 0, uses the plural. */
export function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
