import { formatNgnFromKobo, formatUsdc } from "@certa/shared";
import { loadProject } from "../../lib/data";

export default async function FundPage() {
  const data = await loadProject();
  if (!data) return <p>No project is open.</p>;
  const upTo = 4;
  const covered = data.stages.filter((stage) => stage.stageIndex <= upTo);
  const kobo = covered.reduce((sum, stage) => sum + stage.amountNgnKobo, 0n);
  const usdc = covered.reduce((sum, stage) => sum + stage.amountUsdc, 0n);
  return (
    <div>
      <p className="eyebrow">Lock money</p>
      <h1>Fund the whole contract, or stop at a stage.</h1>
      <p className="muted">Part-payment through the first floor slab covers these stages. The amount has to match the sum exactly.</p>
      <div className="card">
        {covered.map((stage) => (
          <div className="row" key={stage.id}>
            <span>{stage.name}</span>
            <span>{formatNgnFromKobo(stage.amountNgnKobo)}</span>
          </div>
        ))}
        <div className="row">
          <strong>Up to stage {upTo + 1}</strong>
          <strong>
            {formatNgnFromKobo(kobo)} · {formatUsdc(usdc)}
          </strong>
        </div>
      </div>
      <p className="muted">Full contract: {data.pair}</p>
      <form action="/api/mini/fund" method="post">
        <input type="hidden" name="upToStage" value={String(upTo)} />
        <button type="submit">Confirm part-payment</button>
      </form>
    </div>
  );
}
