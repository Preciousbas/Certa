import { createPartyWallet } from "@certa/chain";
import { ensureWallet, parties, redeemJoinCode, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { getOrCreateWallet } from "../../server/chain/wallets.js";
import { joinedPayKeyboard } from "../keyboards.js";
import { bGe7, bIn10, bIn4, bIn5, bIn6, bIn8, bIn9, bSt5 } from "../messages.js";
import { notify } from "../notify.js";
import { writeSession } from "../state.js";
import { memberUsers, roleLabel, say, type Actor, type Outbound } from "./common.js";

function paymentPurpose(role: string): "client" | "consultant" | "contractor" | "subcontractor" | null {
  if (role === "client" || role === "consultant" || role === "contractor" || role === "subcontractor") return role;
  return null;
}

export async function joinWithCode(db: Database, actor: Actor, code: string, now: Date): Promise<Outbound> {
  const result = await redeemJoinCode(db, { telegramId: actor.telegramId, name: actor.firstName, code, now });
  await writeSession(db, actor.telegramId, { step: null, projectId: result.ok ? result.projectId : (actor.project?.id ?? null) }, now);
  if (!result.ok) {
    if (result.reason === "rate_limited") return say(bGe7());
    if (result.reason === "revoked") return say(bIn9());
    if (result.reason === "taken") return say(bIn8());
    return say(bSt5());
  }
  const party = (await db.select().from(parties).where(eq(parties.id, result.partyId)))[0];
  try {
    const purpose = paymentPurpose(result.role);
    await ensureWallet(db, result.partyId, async () => {
      if (!party || !purpose) return createPartyWallet(result.partyId);
      const wallet = await getOrCreateWallet(db, { purpose, userId: party.userId ?? undefined, projectId: result.projectId });
      return { address: wallet.address, walletId: wallet.accountRef, mock: wallet.mock };
    });
  } catch (error) {
    console.error(JSON.stringify({ msg: "join wallet", message: error instanceof Error ? error.message : "failed" }));
    return say(`${result.role === "consultant" ? bIn5({ project: result.projectName }) : bIn4({ project: result.projectName })}\n${bIn10()}`);
  }
  const clients = await memberUsers(db, result.projectId, "client");
  for (const client of clients) {
    if (client.id === actor.userId) continue;
    await notify(db, {
      userId: client.id,
      messageId: "B-IN-6",
      text: bIn6({ name: actor.firstName, project: result.projectName, roleLabel: roleLabel(result.role) }),
      dedupeKey: `bin6:${result.projectId}:${actor.userId}`,
      chatId: client.telegramId.toString(),
    });
  }
  if (result.role === "consultant") return say(bIn5({ project: result.projectName }));
  if (result.role === "contractor" || result.role === "subcontractor") {
    return say(bIn4({ project: result.projectName }), joinedPayKeyboard());
  }
  return say(bIn4({ project: result.projectName }));
}
