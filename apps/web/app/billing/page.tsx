import { usdcFromNgnKobo } from "@certa/shared";
import { AgentSpend } from "../../components/agent-spend";
import { MoneyAmount } from "../../components/money";
import { PlanPause } from "../../components/plan-pause";
import { loadProject } from "../../lib/data";
import { billingConfig, releaseFeeKobo } from "../../../../src/lib/billing";
import { getDatabase } from "@certa/db";
import { presentSpend, projectSpend } from "../../../../src/server/x402/report";

function percentFromBps(bps: string): string {
  const value = BigInt(bps);
  const whole = value / 100n;
  const frac = value % 100n;
  if (frac === 0n) return `${whole.toString()}%`;
  return `${whole.toString()}.${frac.toString().padStart(2, "0")}%`;
}

export default async function BillingPage() {
  const data = await loadProject();
  const db = await getDatabase();
  const config = billingConfig();
  const rate = data?.project.fxRateLocked ?? null;
  const spend = data ? presentSpend(await projectSpend(db, data.project.id)) : null;
  const exampleReleaseKobo = 500_000_000n;
  const exampleFeeKobo = releaseFeeKobo(exampleReleaseKobo, BigInt(config.freeProjectLimitKobo));
  const usdc = (kobo: bigint | string) => (rate ? usdcFromNgnKobo(BigInt(kobo), rate).toString() : null);
  return (
    <div>
      <p className="eyebrow">Plan</p>
      <h1>Per active project. Pause when the site sleeps.</h1>
      <div className="card">
        <div className="row">
          <span>Builder & consultant plan</span>
          <span>
            <MoneyAmount kobo={config.monthlyKobo} usdc={usdc(config.monthlyKobo)} /> a month, or{" "}
            <MoneyAmount kobo={config.yearlyKobo} usdc={usdc(config.yearlyKobo)} /> a year (2 months free).
          </span>
        </div>
        <div className="row">
          <span>Clients</span>
          <span>
            {percentFromBps(config.releaseFeeBps)} of each release, capped at{" "}
            <MoneyAmount kobo={config.releaseFeeCapKobo} usdc={usdc(config.releaseFeeCapKobo)} /> per release.
          </span>
        </div>
        <div className="row">
          <span>First project</span>
          <span>
            Free up to <MoneyAmount kobo={config.freeProjectLimitKobo} usdc={usdc(config.freeProjectLimitKobo)} /> paid out.
          </span>
        </div>
        <div className="row">
          <span>Example</span>
          <span>
            A <MoneyAmount kobo={exampleReleaseKobo.toString()} usdc={usdc(exampleReleaseKobo)} /> release costs{" "}
            <MoneyAmount kobo={exampleFeeKobo.toString()} usdc={usdc(exampleFeeKobo)} />.
          </span>
        </div>
      </div>
      <p className="muted">Payment provider charges are separate.</p>
      {spend ? <AgentSpend heading={spend.heading} rows={spend.rows} /> : null}
      {data ? <PlanPause projectId={data.project.id} /> : <p className="muted">Open Certa in Telegram to pause.</p>}
    </div>
  );
}
