import { formatNgnFromKobo } from "@certa/shared";
import { loadProject } from "../../lib/data";

export default async function StagesPage() {
  const data = await loadProject();
  if (!data) return <p>No project is open.</p>;
  return (
    <div>
      <p className="eyebrow">Stage ledger</p>
      <h1>Confirm the split before anyone accepts it.</h1>
      <div className="card">
        {data.stages.map((stage) => (
          <div className="row" key={stage.id}>
            <div>
              <strong>{stage.stageIndex + 1}. {stage.name}</strong>
              <div className="faint">{stage.description}</div>
            </div>
            <div>{formatNgnFromKobo(stage.amountNgnKobo)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
