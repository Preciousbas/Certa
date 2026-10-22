import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  keccak256,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const root = new URL("../../", import.meta.url);
const envPath = new URL(".env", root);
const deployPath = new URL("deployments/sepolia.json", root);

function loadEnv(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

const env = loadEnv(envPath);
const clientAccount = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const contractorAccount = privateKeyToAccount(env.CONTRACTOR_PRIVATE_KEY);
const factory = env.ESCROW_FACTORY_ADDRESS;
const usdc = env.USDC_ADDRESS;
const rpc = env.SEPOLIA_RPC_URL || env.BASE_SEPOLIA_RPC_URL;

const pilot = process.env.PILOT === "1";
const projectId = keccak256(toBytes(pilot ? "certa:lekki:pilot:v1" : "certa:lekki:em22:v1"));
const termsHash = keccak256(toBytes(pilot ? "EM 22 Lekki pilot, 1 USDC per stage" : "EM 22 Lekki duplex stages accepted"));
const stageBps = [300, 1200, 1000, 1200, 1500, 1000, 1000, 1000, 1300, 500];
const sumUsdc = 30_000_000_000n;
const stageAmounts = pilot ? stageBps.map(() => 1_000_000n) : stageBps.map((bps) => (sumUsdc * BigInt(bps)) / 10_000n);
const mobilisationAmount = pilot ? 1_000_000n : (sumUsdc * 1_000n) / 10_000n;
const spendingCap = pilot ? 5_000_000n : 3_333_333_333n;

const factoryAbi = [
  {
    type: "function",
    name: "escrowByProject",
    stateMutability: "view",
    inputs: [{ name: "projectId", type: "bytes32" }],
    outputs: [{ name: "escrow", type: "address" }],
  },
  {
    type: "function",
    name: "createEscrow",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "client", type: "address" },
          { name: "contractor", type: "address" },
          { name: "consultant", type: "address" },
          { name: "operator", type: "address" },
          { name: "admin", type: "address" },
          { name: "token", type: "address" },
          { name: "stageAmounts", type: "uint256[]" },
          { name: "retentionBps", type: "uint16" },
          { name: "mobilisationAmount", type: "uint256" },
          { name: "spendingCap", type: "uint256" },
          { name: "termsHash", type: "bytes32" },
          { name: "defectsPeriodSeconds", type: "uint64" },
          { name: "projectId", type: "bytes32" },
        ],
      },
    ],
    outputs: [{ name: "escrow", type: "address" }],
  },
];

const escrowAbi = [
  { type: "function", name: "acceptTerms", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "clientAccepted", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "contractorAccepted", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "quoteFund",
    stateMutability: "view",
    inputs: [{ name: "upToStage", type: "uint8" }],
    outputs: [{ name: "expected", type: "uint256" }],
  },
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
];

const publicClient = createPublicClient({ chain: sepolia, transport: http(rpc, { timeout: 30_000 }) });

function wallet(account) {
  return createWalletClient({ account, chain: sepolia, transport: http(rpc, { timeout: 30_000 }) });
}

async function send(account, parameters) {
  const gas = await publicClient.estimateGas({ ...parameters, account: account.address });
  const limit = gas * 3n > 12_000_000n ? gas * 3n : 12_000_000n;
  const hash = await wallet(account).writeContract({ ...parameters, gas: limit });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`reverted ${hash}`);
  return hash;
}

if (clientAccount.address.toLowerCase() === contractorAccount.address.toLowerCase()) {
  throw new Error("Client and contractor are the same address.");
}

const [clientEth, contractorEth, clientUsdc] = await Promise.all([
  publicClient.getBalance({ address: clientAccount.address }),
  publicClient.getBalance({ address: contractorAccount.address }),
  publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [clientAccount.address] }),
]);
console.log("client", clientAccount.address);
console.log("contractor", contractorAccount.address);
console.log("client_eth", formatUnits(clientEth, 18));
console.log("contractor_eth", formatUnits(contractorEth, 18));
console.log("client_usdc", formatUnits(clientUsdc, 6));

if (contractorEth < 1_000_000_000_000_000n) {
  const hash = await wallet(clientAccount).sendTransaction({
    to: contractorAccount.address,
    value: 2_000_000_000_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`eth transfer reverted ${hash}`);
  console.log("funded_contractor_gas", hash);
}

const params = {
  client: clientAccount.address,
  contractor: contractorAccount.address,
  consultant: clientAccount.address,
  operator: clientAccount.address,
  admin: clientAccount.address,
  token: usdc,
  stageAmounts,
  retentionBps: 500,
  mobilisationAmount,
  spendingCap,
  termsHash,
  defectsPeriodSeconds: 180n * 24n * 60n * 60n,
  projectId,
};

let escrow = await publicClient.readContract({
  address: factory,
  abi: factoryAbi,
  functionName: "escrowByProject",
  args: [projectId],
});
if (escrow === "0x0000000000000000000000000000000000000000") {
  const hash = await send(clientAccount, { address: factory, abi: factoryAbi, functionName: "createEscrow", args: [params] });
  console.log("created", hash);
  escrow = await publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "escrowByProject",
    args: [projectId],
  });
}
console.log("escrow", escrow);

const [clientAccepted, contractorAccepted] = await Promise.all([
  publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "clientAccepted" }),
  publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "contractorAccepted" }),
]);
if (!clientAccepted) console.log("client_accepted", await send(clientAccount, { address: escrow, abi: escrowAbi, functionName: "acceptTerms" }));
if (!contractorAccepted) {
  console.log("contractor_accepted", await send(contractorAccount, { address: escrow, abi: escrowAbi, functionName: "acceptTerms" }));
}

const quote = await publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "quoteFund", args: [0] });
console.log("quote_stage0_usdc", formatUnits(quote, 6));
if (clientUsdc < quote) {
  console.log("fund_skipped", "client USDC is below the first quote");
} else {
  const allowance = await publicClient.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [clientAccount.address, escrow],
  });
  if (allowance < quote) {
    console.log("approved", await send(clientAccount, { address: usdc, abi: erc20Abi, functionName: "approve", args: [escrow, quote] }));
  }
  console.log("funded", await send(clientAccount, { address: escrow, abi: escrowAbi, functionName: "fund", args: [quote, 0] }));
}

const recorded = JSON.parse(readFileSync(deployPath, "utf8"));
recorded.client = clientAccount.address;
recorded.contractor = contractorAccount.address;
recorded.recordedAt = new Date().toISOString();
if (pilot) {
  recorded.fullEscrow = recorded.fullEscrow || recorded.escrow;
  recorded.fullProjectId = recorded.fullProjectId || recorded.projectId;
  recorded.pilotEscrow = escrow;
  recorded.pilotProjectId = projectId;
  recorded.pilotTermsHash = termsHash;
  recorded.escrow = escrow;
  recorded.projectId = projectId;
  recorded.termsHash = termsHash;
} else {
  recorded.projectId = projectId;
  recorded.escrow = escrow;
  recorded.termsHash = termsHash;
}
writeFileSync(deployPath, JSON.stringify(recorded, null, 2) + "\n");

const lines = readFileSync(envPath, "utf8").split("\n").filter((line) => line.length > 0);
const keep = lines.filter((line) => !/^(ESCROW_ADDRESS|FULL_ESCROW_ADDRESS|CLIENT_ADDRESS|CONTRACTOR_ADDRESS)=/.test(line));
keep.push(`CLIENT_ADDRESS=${clientAccount.address}`);
keep.push(`CONTRACTOR_ADDRESS=${contractorAccount.address}`);
keep.push(`FULL_ESCROW_ADDRESS=${pilot ? recorded.fullEscrow : escrow}`);
keep.push(`ESCROW_ADDRESS=${escrow}`);
writeFileSync(envPath, keep.join("\n") + "\n");
console.log("recorded", escrow);
