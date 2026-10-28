import { accountName } from "@certa/chain";
import { createMemoryDatabase, startOwnProject } from "@certa/db";
import { describe, expect, it } from "vitest";
import { assertRolesDistinct, getOrCreateWallet, RolesNotDistinct } from "./wallets.js";

describe("role wallets", () => {
  it("stores one mock account per purpose and refuses a shared address", async () => {
    const { db, close } = await createMemoryDatabase();
    const started = await startOwnProject(db, { telegramId: 46001n, name: "Ada", projectName: "Gate", role: "client" });
    const first = await getOrCreateWallet(db, { purpose: "client", userId: started.userId, projectId: started.projectId });
    const second = await getOrCreateWallet(db, { purpose: "client", userId: started.userId, projectId: started.projectId });
    const operator = await getOrCreateWallet(db, { purpose: "operator" });
    expect(first.address).toBe(second.address);
    expect(first.mock).toBe(true);
    expect(operator.address).not.toBe(first.address);
    expect(accountName("contractor", first.id).startsWith("certa-")).toBe(true);
    expect(() =>
      assertRolesDistinct({
        client: first.address,
        consultant: operator.address,
        operator: operator.address,
        contractor: "0x9999999999999999999999999999999999999999",
      }),
    ).toThrow(RolesNotDistinct);
    await close();
  });

  it("returns the same client address for a second project", async () => {
    const { db, close } = await createMemoryDatabase();
    const first = await startOwnProject(db, { telegramId: 46002n, name: "Ada", projectName: "Gate", role: "client" });
    const second = await startOwnProject(db, { telegramId: 46002n, name: "Ada", projectName: "House", role: "client" });
    const gate = await getOrCreateWallet(db, { purpose: "client", userId: first.userId, projectId: first.projectId });
    const house = await getOrCreateWallet(db, { purpose: "client", userId: second.userId, projectId: second.projectId });
    expect(house.address).toBe(gate.address);
    expect(first.userId).toBe(second.userId);
    await close();
  });
});
