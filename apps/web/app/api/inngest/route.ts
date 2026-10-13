import { serve } from "inngest/next";
import { disputeTimer, escalateChanges, inngest } from "../../../lib/jobs";

export const { GET, POST, PUT } = serve({ client: inngest, functions: [escalateChanges, disputeTimer] });
