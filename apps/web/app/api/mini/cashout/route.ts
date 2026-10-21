import { apiError, cashoutInput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ json }) => {
    const input = cashoutInput.safeParse(json);
    if (!input.success) return apiError(400, "This project is missing.");
    return apiError(409, "Cash out to a bank is not open yet.");
  },
  { roles: ["contractor", "subcontractor"] },
);
