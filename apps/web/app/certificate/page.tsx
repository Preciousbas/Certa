import { formatNgnFromKobo, formatUsdc } from "@certa/shared";
import { SEPOLIA_CHAIN_ID, explorerAddress, explorerTx } from "../../lib/explorer";
import { loadProject } from "../../lib/data";
import { pilotEscrowAddress } from "../../lib/published-chain";

export default async function CertificatePage() {
  const data = await loadProject();
  if (!data) return <p>No project is open.</p>;
  const escrow = data.project.escrowAddress && /^0x[a-fA-F0-9]{40}$/.test(data.project.escrowAddress) ? data.project.escrowAddress : pilotEscrowAddress();
  return (
    <article className="card">
      <p className="eyebrow">Payment certificate</p>
      <h1>{data.project.name}</h1>
      <p className="muted">{data.moneyNote ?? "Stage amounts follow the escrow and the Central Bank rate."}</p>
      <p>
        <a href={explorerAddress(SEPOLIA_CHAIN_ID, escrow)}>Escrow {escrow}</a>
      </p>
      <ol className="plain">
        {data.stages.map((stage) => {
          const tx = data.payments.find((row) => row.stageId === stage.id && row.txHash)?.txHash;
          return (
            <li key={stage.id}>
              {stage.stageIndex + 1}. {stage.name} — {stage.status} — {formatNgnFromKobo(stage.amountNgnKobo)} ({formatUsdc(stage.amountUsdc)})
              {tx ? (
                <>
                  {" "}
                  <a href={explorerTx(SEPOLIA_CHAIN_ID, tx)}>Transaction</a>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
    </article>
  );
}
