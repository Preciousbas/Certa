export const certaEscrowAbi = [
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "upToStage", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submitStage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "i", type: "uint256" },
      { name: "evidenceHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "releaseStage",
    stateMutability: "nonpayable",
    inputs: [{ name: "i", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "quoteFund",
    stateMutability: "view",
    inputs: [{ name: "upToStage", type: "uint8" }],
    outputs: [{ name: "expected", type: "uint256" }],
  },
  {
    type: "event",
    name: "Funded",
    inputs: [
      { name: "projectId", type: "bytes32", indexed: true },
      { name: "upToStage", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "funder", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "StageReleased",
    inputs: [
      { name: "projectId", type: "bytes32", indexed: true },
      { name: "stage", type: "uint256", indexed: true },
      { name: "payout", type: "uint256", indexed: false },
      { name: "retentionHeld", type: "uint256", indexed: false },
    ],
  },
] as const;

export const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
export const SEPOLIA_CHAIN_ID = 11155111;
export const USDC_BASE_SEPOLIA = USDC_SEPOLIA;
export const BASE_SEPOLIA_CHAIN_ID = SEPOLIA_CHAIN_ID;
