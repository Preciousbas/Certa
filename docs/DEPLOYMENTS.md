# Deployments

Recorded 13 Oct 2026. Addresses below are the ones this repo actually used. Nothing has been broadcast.

| What | Network | Address |
| --- | --- | --- |
| Circle test USDC | Base Sepolia (84532) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Escrow implementation | — | Not deployed |
| Escrow factory | — | Not deployed |
| Operator wallet | — | Not created |
| Treasury | — | Not set |
| Vercel | — | Not deployed in this pass until the CLI is authenticated |

`contracts/script/Deploy.s.sol` deploys the implementation and the factory. It does not create a project escrow. Run it only with a funded deployer key that stays out of git:

```bash
bash scripts/setup-contracts.sh
forge script script/Deploy.s.sol --root contracts --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast --verify
```

Paste the logged implementation and factory into this file in the same commit that broadcasts. Do not invent them.

The Mini App build command is `pnpm --filter @certa/web build`. `vercel.json` at the repo root points Vercel at that command. The project root for the Next app is the repository root, not `apps/web`, because the workspace packages are imported from `packages/*`.
