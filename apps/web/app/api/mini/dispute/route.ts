import { apiError, disputeInput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ json }) => {
    const input = disputeInput.safeParse(json);
    if (!input.success) return apiError(400, "A dispute needs a reason.");
    return apiError(409, "That stage cannot be disputed from here yet.");
  },
  { roles: ["client"] },
);
