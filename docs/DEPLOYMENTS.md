# Deployments

Recorded 13 Oct 2026. Addresses below are the ones this repo actually used. Nothing has been broadcast.

| What | Network | Address |
| --- | --- | --- |
| Circle test USDC | Base Sepolia (84532) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Escrow implementation | — | Not deployed |
| Escrow factory | — | Not deployed |
| Operator wallet | — | Not created |
| Treasury | — | Not set |
| Vercel preview | — | https://certa-qcaa4nsi0-precious-projects-cdb8e677.vercel.app |

`contracts/script/Deploy.s.sol` deploys the implementation and the factory. It does not create a project escrow. Run it only with a funded deployer key that stays out of git:

```bash
bash scripts/setup-contracts.sh
forge script script/Deploy.s.sol --root contracts --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast --verify
```

Paste the logged implementation and factory into this file in the same commit that broadcasts. Do not invent them.

The Vercel project is `certa` under Precious' projects. The root directory is `apps/web`. Install is `cd ../.. && pnpm install`, then `next build`. Checked on 13 Oct 2026: `/api/health` returns the demo database ok, `/api/paid/weather` returns 402, and `/` renders the Lekki duplex. Vercel Authentication is still on, so a logged-out browser is asked to sign in. Turn that off in the project settings before sending the link to judges. Nothing has been promoted to the production alias. The bot webhook is not set, because `TELEGRAM_BOT_TOKEN` is not on the project.
