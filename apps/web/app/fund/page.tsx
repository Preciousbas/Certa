import { FundForm } from "../../components/fund-form";
import { formatNgnFromKobo } from "@certa/shared";
import { loadProject } from "../../lib/data";
import { defaultUpTo } from "../../../../src/lib/fund-range";
import { chainFundLines } from "../../lib/escrow-quote";

export default async function FundPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const query = await searchParams;
  const data = await loadProject(query.project);
  if (!data) return <p>Nothing has happened on this project yet. Upload the contract or BoQ to begin.</p>;
  const escrow = data.project.escrowAddress ?? "";
  const chain = await chainFundLines(
    escrow,
    data.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      stageIndex: stage.stageIndex,
      onChainIdx: stage.onChainIdx,
      kind: stage.kind,
      funded: stage.funded,
      amountUsdc: stage.amountUsdc,
      amountNgnKobo: stage.amountNgnKobo,
    })),
    data.project.fxRateLocked,
  ).catch(() => null);
  const byId = new Map((chain ?? []).filter((line) => line.id).map((line) => [line.id, line]));
  const stages = data.stages.map((stage) => {
    const line = byId.get(stage.id);
    return {
      id: stage.id,
      name: stage.kind === "mobilisation" ? "Mobilisation" : stage.name,
      kobo: (line?.kobo ?? stage.amountNgnKobo).toString(),
      usdc: (line?.usdc ?? stage.amountUsdc).toString(),
      funded: stage.funded,
      stageIndex: stage.stageIndex,
      kind: stage.kind,
    };
  });
  return (
    <FundForm
      projectId={data.project.id}
      rateLabel={formatNgnFromKobo(data.project.fxRateLocked)}
      defaultUpTo={defaultUpTo(data.stages)}
      agreed={Boolean(data.project.currentContractVersionId)}
      stages={stages}
    />
  );
}
