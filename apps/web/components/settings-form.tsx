"use client";

import { useState } from "react";
import { saveSettings, setPaused } from "../app/settings/actions";
import { ConfirmDialog, Toast } from "./ui/dialog";

export function SettingsForm({
  lat,
  lng,
  radius,
  disputeDays,
  replyHours,
  capUsdc,
  capNaira,
  paused,
}: {
  lat: string;
  lng: string;
  radius: number;
  disputeDays: number;
  replyHours: number;
  capUsdc: string;
  capNaira: string;
  paused: boolean;
}) {
  const [ask, setAsk] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div>
      <form
        className="card stack"
        action={async (formData) => {
          const result = await saveSettings(formData);
          setMessage(result.message);
        }}
      >
        <h2>Site location</h2>
        <label>Latitude<input name="lat" defaultValue={lat} /></label>
        <label>Longitude<input name="lng" defaultValue={lng} /></label>
        <label>
          Site radius ({radius} m)
          <input name="radius" type="range" min={25} max={2000} defaultValue={radius} />
        </label>
        <p className="muted">Spending cap {capUsdc}. About {capNaira} at the contract rate. A change to the cap is logged.</p>
        <label>Dispute decision days<input name="disputeDays" type="number" min={1} max={90} defaultValue={disputeDays} /></label>
        <label>Reply window in hours<input name="replyHours" type="number" min={1} max={168} defaultValue={replyHours} /></label>
        <label>
          Letterhead (PDF or PNG)
          <input name="letterhead" type="file" accept="application/pdf,image/png" />
        </label>
        <button className="ui-btn ui-btn-secondary" type="submit">Save settings</button>
      </form>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>{paused ? "Resume project" : "Pause project"}</h2>
        <button className="ui-btn ui-btn-secondary" type="button" onClick={() => setAsk(true)}>
          {paused ? "Resume" : "Pause project"}
        </button>
      </div>
      <ConfirmDialog
        open={ask}
        title={paused ? "Resume project" : "Pause project"}
        body={paused ? "Resume allows payments and photo checks again." : "Pausing stops billing and blocks new payments and photo checks. Locked money stays in the escrow. You can resume any time."}
        confirmLabel={paused ? "Resume" : "Pause project"}
        onClose={() => setAsk(false)}
        onConfirm={() => {
          setAsk(false);
          void setPaused(!paused).then((result) => setMessage(result.message));
        }}
      />
      <Toast message={message} />
    </div>
  );
}
