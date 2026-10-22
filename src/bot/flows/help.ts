import { bGe3 } from "../messages.js";
import { say, supportEmail, type EngineDeps, type Outbound } from "./common.js";

export function helpText(deps: EngineDeps): Outbound {
  return say(bGe3({ supportEmail: supportEmail(deps) }));
}
