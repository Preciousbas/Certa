import { formatNaira } from "../../../../src/lib/money/kobo";
import { formatUsdc } from "../../../../src/lib/money/usdc";
import { koboFromUsdc } from "@certa/shared";
import { SettingsForm } from "../../components/settings-form";
import { loadProject } from "../../lib/data";

export default async function SettingsPage() {
  const data = await loadProject();
  if (!data) return <p>No project is open.</p>;
  const rateLocked = data.project.fxRateLocked > 0n;
  const capNaira = rateLocked ? formatNaira(koboFromUsdc(data.project.spendingCapUsdc, data.project.fxRateLocked)) : "";
  return (
    <div>
      <p className="eyebrow">Settings</p>
      <h1>{data.project.name}</h1>
      <SettingsForm
        lat={String(data.project.siteLat)}
        lng={String(data.project.siteLng)}
        radius={data.project.geofenceRadiusM}
        disputeDays={data.project.disputeTimeoutDays}
        replyHours={data.project.changeReplyHours}
        capUsdc={formatUsdc(data.project.spendingCapUsdc, { dp: 2 })}
        capNaira={capNaira}
        rateLocked={rateLocked}
        paused={data.project.status === "paused"}
      />
    </div>
  );
}
