/** Published Ethereum Sepolia addresses. Env wins when it is set. */
export const PUBLISHED_FACTORY = "0x4F4c6cc95465ceFe8a967E351EEdE69d40660423";
export const PUBLISHED_ESCROW = "0x5289dcc36EdC15AdC6314F75EcBFa745e70BD44d";

function address(value: string | undefined, fallback: string): string {
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? value : fallback;
}

export function factoryAddress(): string {
  return address(process.env.ESCROW_FACTORY_ADDRESS, PUBLISHED_FACTORY);
}

export function pilotEscrowAddress(): string {
  return address(process.env.ESCROW_ADDRESS, PUBLISHED_ESCROW);
}
