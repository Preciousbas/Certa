#!/usr/bin/env bash
# Broadcasts the escrow implementation and factory to Ethereum Sepolia.
# Refuses to run without a deployer key. Does not invent addresses.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
  echo "DEPLOYER_PRIVATE_KEY is unset. Nothing was broadcast." >&2
  exit 1
fi
rpc="${SEPOLIA_RPC_URL:-${BASE_SEPOLIA_RPC_URL:-}}"
if [[ -z "$rpc" || -z "${USDC_ADDRESS:-}" ]]; then
  echo "SEPOLIA_RPC_URL and USDC_ADDRESS are required." >&2
  exit 1
fi
cd "$root/contracts"
# Sepolia charges more to store bytecode than Forge's local estimate. 1000% clears both creates.
forge script script/Deploy.s.sol:DeployScript --rpc-url "$rpc" --broadcast --slow --non-interactive -g 1000
export BROADCAST_RUN="$root/contracts/broadcast/Deploy.s.sol/11155111/run-latest.json"
export BROADCAST_OUT="$root/deployments/sepolia.json"
mkdir -p "$root/deployments"
node << 'EOF'
const { readFileSync, writeFileSync } = require("node:fs");
const runPath = process.env.BROADCAST_RUN;
const run = JSON.parse(readFileSync(runPath, "utf8"));
const rows = run.transactions ?? [];
const pick = (name) => rows.find((row) => row.contractName === name)?.contractAddress ?? "";
const implementation = pick("CertaEscrow");
const factory = pick("EscrowFactory");
if (!/^0x[a-fA-F0-9]{40}$/.test(implementation) || !/^0x[a-fA-F0-9]{40}$/.test(factory)) {
  console.error("Broadcast log has no escrow addresses.");
  process.exit(1);
}
const chainId = Number(run.chain ?? 11155111);
if (chainId !== 11155111) {
  console.error(`Broadcast landed on chain ${chainId}, expected 11155111.`);
  process.exit(1);
}
const recorded = {
  chainId,
  usdc: process.env.USDC_ADDRESS,
  implementation,
  factory,
  recordedAt: new Date().toISOString(),
};
writeFileSync(process.env.BROADCAST_OUT, JSON.stringify(recorded, null, 2) + "\n");
console.log(factory);
EOF
