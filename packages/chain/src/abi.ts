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
    name: "StageReleased",
    inputs: [
      { name: "projectId", type: "bytes32", indexed: true },
      { name: "stage", type: "uint256", indexed: true },
      { name: "payout", type: "uint256", indexed: false },
      { name: "retentionHeld", type: "uint256", indexed: false },
    ],
  },
] as const;

export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
