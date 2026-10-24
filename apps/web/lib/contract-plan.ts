export function planIsAccepted(versions: { status: string }[]): boolean {
  return versions.some((version) => version.status === "accepted");
}

export function contractPlanCopy(accepted: boolean): string {
  if (accepted) return "The accepted version is locked. A later change needs both sides to accept again.";
  return "The plan is not accepted yet.";
}
