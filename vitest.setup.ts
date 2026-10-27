const secretKeys = ["DEPLOYER_PRIVATE_KEY", "CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET"] as const;

if (secretKeys.some((key) => process.env[key])) {
  throw new Error("Unset DEPLOYER_PRIVATE_KEY / CDP keys before running tests");
}

if (process.env.DATABASE_URL) {
  throw new Error("Run tests with env -u DATABASE_URL");
}
