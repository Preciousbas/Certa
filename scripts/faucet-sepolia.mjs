import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const address = env.CLIENT_ADDRESS;
if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? "")) {
  console.error("CLIENT_ADDRESS is missing.");
  process.exit(1);
}

const apiKey = env.CIRCLE_API_KEY ?? "";
if (!apiKey) {
  console.log("circle_api_key missing");
  console.log("public_faucet https://faucet.circle.com");
  console.log("address", address);
  console.log("network Ethereum Sepolia");
  console.log("token USDC");
  process.exit(0);
}

const response = await fetch("https://api.circle.com/v1/faucet/drips", {
  method: "POST",
  headers: {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    address,
    blockchain: "ETH-SEPOLIA",
    native: false,
    usdc: true,
    eurc: false,
  }),
});
const text = await response.text();
console.log("status", response.status);
console.log(text.slice(0, 500));
if (!response.ok) process.exit(1);
