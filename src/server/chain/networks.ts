export const SEPOLIA_CHAIN_ID = 11155111;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

type Network = {
  chainId: number;
  name: string;
  explorerName: string;
  tx: (hash: string) => string;
  address: (address: string) => string;
};

const networks: Record<number, Network> = {
  [SEPOLIA_CHAIN_ID]: {
    chainId: SEPOLIA_CHAIN_ID,
    name: "Ethereum Sepolia",
    explorerName: "Etherscan (Sepolia)",
    tx: (hash) => `https://sepolia.etherscan.io/tx/${hash}`,
    address: (address) => `https://sepolia.etherscan.io/address/${address}`,
  },
  [BASE_SEPOLIA_CHAIN_ID]: {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    name: "Base Sepolia",
    explorerName: "Basescan (Base Sepolia)",
    tx: (hash) => `https://sepolia.basescan.org/tx/${hash}`,
    address: (address) => `https://sepolia.basescan.org/address/${address}`,
  },
};

export function networkOf(chainId = SEPOLIA_CHAIN_ID): Network {
  return networks[chainId] ?? networks[SEPOLIA_CHAIN_ID]!;
}

export function explorerTx(chainId: number, hash: string): string {
  return networkOf(chainId).tx(hash);
}

export function explorerAddress(chainId: number, address: string): string {
  return networkOf(chainId).address(address);
}

export function explorerLabel(chainId: number): string {
  return networkOf(chainId).explorerName;
}
