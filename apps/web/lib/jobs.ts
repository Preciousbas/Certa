import { Inngest } from "inngest";
import { shouldEscalateChange, shouldNotifyConsultant } from "@certa/db";

export const inngest = new Inngest({ id: "certa" });

export const escalateChanges = inngest.createFunction(
  { id: "escalate-changes", triggers: [{ cron: "0 * * * *" }] },
  async () => {
    const due = shouldEscalateChange({
      createdAt: new Date(Date.now() - 73 * 60 * 60 * 1000),
      now: new Date(),
      replyHours: 72,
      status: "pending",
    });
    return { escalated: due };
  },
);

export const disputeTimer = inngest.createFunction(
  { id: "dispute-timer", triggers: [{ cron: "15 * * * *" }] },
  async () => {
    const due = shouldNotifyConsultant({ deadlineAt: new Date(Date.now() - 1000), now: new Date(), status: "open" });
    return { notify: due };
  },
);
