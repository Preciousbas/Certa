import { MiniGo } from "../../../components/mini-go";
import { loadProject } from "../../../lib/data";

export default async function MiniContractPage() {
  const data = await loadProject();
  return (
    <div>
      <p className="eyebrow">Agreement</p>
      <h1>Review plan</h1>
      <p>By accepting, you agree that these stages and amounts are the payment plan. Any later change needs both of you to accept again.</p>
      {data ? <MiniGo href={`/app/p/${data.project.id}/contract`} label="Open the agreement" /> : <p>No agreement is open.</p>}
    </div>
  );
}
