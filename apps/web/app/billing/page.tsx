import { getDatabase, plans } from "@certa/db";
import { CERTA_FEE_BPS, usdcFromNgnKobo } from "@certa/shared";
import { MoneyAmount } from "../../components/money";
import { PlanPause } from "../../components/plan-pause";
import { loadProject } from "../../lib/data";

function feeLabel(bps: bigint): string {
  const whole = bps / 100n;
  const frac = (bps % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}%`;
}

export default async function BillingPage() {
  const data = await loadProject();
  const db = await getDatabase();
  const rows = await db.select().from(plans);
  const rate = data?.project.fxRateLocked;
  return (
    <div>
      <p className="eyebrow">Plan</p>
      <h1>Per active project. Pause when the site sleeps.</h1>
      <div className="card">
        {rows.length === 0 ? <p>No plan is listed.</p> : null}
        {rows.map((plan) => (
          <div className="row" key={plan.id}>
            <span>{plan.name}</span>
            <MoneyAmount
              kobo={plan.priceNgnKobo.toString()}
              usdc={rate ? usdcFromNgnKobo(plan.priceNgnKobo, rate).toString() : null}
            />
          </div>
        ))}
        <div className="row">
          <span>Release fee</span>
          <span>{feeLabel(CERTA_FEE_BPS)}</span>
        </div>
      </div>
      <p className="muted">Gas and the agent’s paid checks come out of the workspace allowance. People on site do not buy gas.</p>
      {data ? <PlanPause projectId={data.project.id} /> : <p className="muted">Open Certa in Telegram to pause.</p>}
    </div>
  );
}
