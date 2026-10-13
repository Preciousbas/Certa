export function shouldEscalateChange(input: {
  createdAt: Date;
  now: Date;
  replyHours: number;
  status: string;
}): boolean {
  if (input.status !== "pending") return false;
  return input.now.getTime() - input.createdAt.getTime() >= input.replyHours * 60 * 60 * 1000;
}

export function shouldNotifyConsultant(input: { deadlineAt: Date; now: Date; status: string }): boolean {
  if (input.status !== "open") return false;
  return input.now.getTime() >= input.deadlineAt.getTime();
}

export function deemedAccepted(input: { allowed: boolean; escalated: boolean; consultantSilent: boolean }): boolean {
  return input.allowed && input.escalated && input.consultantSilent;
}
