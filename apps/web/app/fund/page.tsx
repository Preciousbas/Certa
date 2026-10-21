import { FundForm } from "../../components/fund-form";
import { formatNgnFromKobo } from "@certa/shared";
import { loadProject } from "../../lib/data";
import { chainFundLines } from "../../lib/escrow-quote";

export default async function FundPage() {
  const data = await loadProject();
  if (!data) return <p>Nothing has happened on this project yet. Upload the contract or BoQ to begin.</p>;
  const escrow = data.project.escrowAddress ?? "";
  const chain = await chainFundLines(
    escrow,
    data.stages.map((stage) => ({ name: stage.name, stageIndex: stage.stageIndex })),
    data.project.fxRateLocked,
  ).catch(() => null);
  const stages = (chain ?? data.stages.map((stage) => ({
    name: stage.name,
    usdc: stage.amountUsdc,
    kobo: stage.amountNgnKobo,
  }))).map((stage) => ({
    name: stage.name,
    kobo: stage.kobo.toString(),
    usdc: stage.usdc.toString(),
  }));
  return (
    <FundForm
      projectId={data.project.id}
      rateLabel={formatNgnFromKobo(data.project.fxRateLocked)}
      defaultUpTo={Math.min(4, Math.max(stages.length - 1, 0))}
      stages={stages}
    />
  );
}
