import { accountName, openNamedAccount, type WalletPurpose } from "@certa/chain";
import { wallets, type Database } from "@certa/db";
import { and, eq, isNull } from "drizzle-orm";
import { SEPOLIA_CHAIN_ID } from "./networks.js";

export class RolesNotDistinct extends Error {
  constructor() {
    super("RolesNotDistinct");
    this.name = "RolesNotDistinct";
  }
}

export class ConsultantRequired extends Error {
  constructor() {
    super("Add your consultant before locking money. They certify each stage.");
    this.name = "ConsultantRequired";
  }
}

export type RoleWallet = {
  id: string;
  purpose: WalletPurpose;
  address: `0x${string}`;
  accountRef: string;
  mock: boolean;
};

const PURPOSES = new Set<WalletPurpose>([
  "client",
  "consultant",
  "contractor",
  "subcontractor",
  "operator",
  "agent_x402",
  "treasury",
]);

export function assertRolesDistinct(roles: Record<"client" | "consultant" | "operator" | "contractor", string>): void {
  const values = [roles.client, roles.consultant, roles.operator, roles.contractor].map((value) => value.toLowerCase());
  if (new Set(values).size !== 4) throw new RolesNotDistinct();
}

export async function getOrCreateWallet(
  db: Database,
  input: { purpose: WalletPurpose; userId?: string; projectId?: string; chainId?: number },
): Promise<RoleWallet> {
  if (!PURPOSES.has(input.purpose)) throw new Error("That payment account purpose is not known.");
  const chainId = input.chainId ?? SEPOLIA_CHAIN_ID;
  const shared = input.purpose === "operator" || input.purpose === "treasury" || input.purpose === "agent_x402";
  const userId = shared ? null : (input.userId ?? null);
  const projectId = shared ? null : (input.projectId ?? null);
  const existing = await db
    .select()
    .from(wallets)
    .where(
      and(
        eq(wallets.purpose, input.purpose),
        eq(wallets.chainId, chainId),
        userId ? eq(wallets.userId, userId) : isNull(wallets.userId),
        projectId ? eq(wallets.projectId, projectId) : isNull(wallets.projectId),
      ),
    );
  const found = existing[0];
  if (found) {
    return {
      id: found.id,
      purpose: input.purpose,
      address: found.address as `0x${string}`,
      accountRef: found.providerAccountRef,
      mock: found.provider === "mock",
    };
  }
  const name = accountName(input.purpose, userId ?? projectId ?? input.purpose);
  const opened = await openNamedAccount(name);
  const inserted = await db
    .insert(wallets)
    .values({
      userId,
      projectId,
      purpose: input.purpose,
      provider: opened.mock ? "mock" : "cdp",
      providerAccountRef: opened.name,
      address: opened.address,
      chainId,
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("The payment account was not stored.");
  return {
    id: row.id,
    purpose: input.purpose,
    address: row.address as `0x${string}`,
    accountRef: row.providerAccountRef,
    mock: opened.mock,
  };
}
