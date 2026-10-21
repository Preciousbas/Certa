import { MoneyAmount } from "./money";
import { StatusChip } from "./status-chip";

export function StageRow({
  number,
  name,
  description,
  status,
  kobo,
  usdc,
  txHash,
}: {
  number: number;
  name: string;
  description?: string;
  status: string;
  kobo: string;
  usdc: string;
  txHash?: string | null;
}) {
  const chain = txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash) ? txHash : null;
  return (
    <div className="stage-row">
      <span className="stage-num">{number}</span>
      <div className="stage-copy">
        <strong>{name}</strong>
        {description ? <div className="faint">{description}</div> : null}
        {chain ? (
          <a className="faint" href={`https://sepolia.etherscan.io/tx/${chain}`}>
            Transaction
          </a>
        ) : status === "released" ? (
          <div className="faint">Not on chain yet.</div>
        ) : null}
      </div>
      <StatusChip status={status} />
      <MoneyAmount kobo={kobo} usdc={usdc} />
    </div>
  );
}
