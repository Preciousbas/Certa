import type { Database } from "@certa/db";
import { howKeyboard, startKeyboard } from "../keyboards.js";
import { bSt1, bSt2, bSt4 } from "../messages.js";
import { writeSession } from "../state.js";
import { menuFor, say, type Actor, type EngineDeps, type Outbound } from "./common.js";

export async function welcome(db: Database, actor: Actor, deps: EngineDeps): Promise<Outbound> {
  if (actor.project && actor.role) return menuFor(db, actor, deps);
  return say(bSt1(), startKeyboard());
}

export function howItWorks(): Outbound {
  return say(bSt2(), howKeyboard());
}

export async function askCode(db: Database, actor: Actor, now: Date): Promise<Outbound> {
  await writeSession(db, actor.telegramId, { step: "join_code", projectId: actor.project?.id ?? null }, now);
  return say(bSt4());
}

export async function showMenu(db: Database, actor: Actor, deps: EngineDeps): Promise<Outbound> {
  return menuFor(db, actor, deps);
}
