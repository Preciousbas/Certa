import { MoneyToggle } from "../components/money-toggle";
import { loadProject } from "../lib/data";

export default async function HomePage() {
  const data = await loadProject();
  if (!data) {
    return (
      <div className="card">
        <p className="eyebrow">Empty</p>
        <h1>No project is open.</h1>
        <p className="muted">Create one in Telegram, or start the demo seed.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="eyebrow">📍 EM 22, Lekki · Timeline</p>
      <h1 style={{ fontSize: "2.4rem", margin: "0 0 0.4rem" }}>{data.project.name}</h1>
      <p className="muted">{data.pair}</p>
      <MoneyToggle ngn={data.ngn} usdc={data.usdc} />
      <div className="spine">
        {data.stages.map((stage, index) => (
          <div className="stage" key={stage.id}>
            <div className="rail">
              <div className={`dot ${stage.status === "released" ? "on" : stage.status === "submitted" ? "wait" : ""}`} />
              {index < data.stages.length - 1 ? <div className="stem" /> : null}
            </div>
            <div style={{ paddingBottom: "1rem" }}>
              <h3>{stage.name}</h3>
              <p className="faint" style={{ margin: "0.2rem 0 0" }}>
                {stage.status}
                {stage.pour ? " · pour" : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
