# Deployments

Recorded 16 Oct 2026. `scripts/broadcast-sepolia.sh` broadcast the implementation and the factory to Ethereum Sepolia. Both sources are verified on Etherscan. The script does not create a project escrow.

| What | Network | Address |
| --- | --- | --- |
| Circle test USDC | Ethereum Sepolia (11155111) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Escrow implementation | Ethereum Sepolia | `0x7740796284Bf5eA67F30F123Ee28E5FFFA8CCa1c` |
| Escrow factory | Ethereum Sepolia | `0x4F4c6cc95465ceFe8a967E351EEdE69d40660423` |
| Lekki full escrow | Ethereum Sepolia | `0xCbBB69f9E5373763D430D25e920B6aE4A632cf0d` |
| Lekki pilot escrow | Ethereum Sepolia | `0x5289dcc36EdC15AdC6314F75EcBFa745e70BD44d` |
| Project create tx | Ethereum Sepolia | [`0x2c8e92167c215994935e1baf7cf260d02a7c1c80e93969c4400e394e6c78fe58`](https://sepolia.etherscan.io/tx/0x2c8e92167c215994935e1baf7cf260d02a7c1c80e93969c4400e394e6c78fe58) |
| Implementation tx | Ethereum Sepolia | [`0x9d252d7b1252a3cd31b9bfb717334d0f94b673e650ae0476d37636319dba8166`](https://sepolia.etherscan.io/tx/0x9d252d7b1252a3cd31b9bfb717334d0f94b673e650ae0476d37636319dba8166) |
| Factory tx | Ethereum Sepolia | [`0x33f5c3750b9be29938c14469829d7625461e75f2f9642339ae8b177b1302f9f5`](https://sepolia.etherscan.io/tx/0x33f5c3750b9be29938c14469829d7625461e75f2f9642339ae8b177b1302f9f5) |
| Operator wallet | — | Not created |
| Treasury | — | Not set |
| Vercel preview | — | https://certa-qcaa4nsi0-precious-projects-cdb8e677.vercel.app |

The same addresses are in `deployments/sepolia.json`. Run another broadcast only with a funded deployer key that stays out of git:

```bash
bash scripts/setup-contracts.sh
bash scripts/broadcast-sepolia.sh
```

Paste the logged implementation and factory into this file in the same commit that broadcasts. Do not invent them.

The Vercel project is `certa` under Precious' projects. The root directory is `apps/web`. Install is `cd ../.. && pnpm install`, then `next build`. Checked on 13 Oct 2026: `/api/health` returns the demo database ok, `/api/paid/weather` returns 402, and `/` renders the Lekki duplex. Vercel Authentication is still on, so a logged-out browser is asked to sign in. Turn that off in the project settings before sending the link to judges. Nothing has been promoted to the production alias. The bot webhook is not set, because `TELEGRAM_BOT_TOKEN` is not on the project.
