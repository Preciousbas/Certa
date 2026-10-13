import { loadProject } from "../../lib/data";

export default async function ReportPage() {
  const data = await loadProject();
  const slab = data?.stages.find((stage) => stage.pour && stage.status === "submitted");
  return (
    <div>
      <p className="eyebrow">Daily note</p>
      <h1>What the site showed today.</h1>
      <div className="card">
        <p>{slab ? `${slab.name} is in review at 0.78 confidence.` : "No submission is waiting."}</p>
        <p>Agent paid $0.01 for the weather check. Rain probability on site: 0.18.</p>
        <p className="faint">Safety: none flagged on the slab photos in the seed.</p>
      </div>
    </div>
  );
}
