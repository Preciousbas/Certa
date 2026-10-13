"use client";

import { useState } from "react";

export default function CashoutPage() {
  const [step, setStep] = useState<"quote" | "bank" | "soon">("quote");
  return (
    <div>
      <p className="eyebrow">Cash out</p>
      <h1>Move USDC toward a naira account.</h1>
      {step === "quote" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setStep("bank");
          }}
        >
          <label className="faint" htmlFor="amount">Amount in USDC</label>
          <input id="amount" name="amount" defaultValue="900" />
          <p className="muted">Quote: 900.00 USDC → about ₦1,350,000 before the partner’s fee.</p>
          <button type="submit">Continue</button>
        </form>
      ) : null}
      {step === "bank" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setStep("soon");
          }}
        >
          <label className="faint" htmlFor="bank">Account number</label>
          <input id="bank" name="bank" placeholder="0123456789" />
          <button type="submit">Review</button>
        </form>
      ) : null}
      {step === "soon" ? <p className="card">Coming soon. The partner flow is stubbed behind OffRampProvider.</p> : null}
    </div>
  );
}
