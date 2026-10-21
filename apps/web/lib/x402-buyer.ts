export async function payForWeather(origin: string): Promise<boolean> {
  const key = process.env.EVM_PRIVATE_KEY ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return false;
  const core = await import(/* webpackIgnore: true */ "@x402/core/client");
  const evm = await import(/* webpackIgnore: true */ "@x402/evm/exact/client");
  const paidFetch = await import(/* webpackIgnore: true */ "@x402/fetch");
  const accounts = await import(/* webpackIgnore: true */ "viem/accounts");
  const client = new core.x402Client();
  evm.registerExactEvmScheme(client, { signer: accounts.privateKeyToAccount(key as `0x${string}`) });
  const fetchWithPayment = paidFetch.wrapFetchWithPayment(fetch, client);
  const response = await fetchWithPayment(`${origin}/api/paid/weather`, { signal: AbortSignal.timeout(20_000) });
  return response.ok;
}
