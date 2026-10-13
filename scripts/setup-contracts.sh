#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
lib="$root/contracts/lib"
mkdir -p "$lib"
if [ ! -d "$lib/forge-std/src" ]; then
  git clone --depth 1 https://github.com/foundry-rs/forge-std "$lib/forge-std"
fi
if [ ! -d "$lib/openzeppelin-contracts/contracts" ]; then
  git clone --depth 1 --branch v5.6.1 https://github.com/OpenZeppelin/openzeppelin-contracts "$lib/openzeppelin-contracts"
fi
printf 'forge-std/=lib/forge-std/src/\n@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/\n' > "$root/contracts/remappings.txt"
echo "Foundry libraries ready"
