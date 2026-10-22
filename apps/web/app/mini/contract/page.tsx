export default function MiniContractPage() {
  return (
    <div>
      <p className="eyebrow">Agreement</p>
      <h1>Review plan</h1>
      <p>By accepting, you agree that these stages and amounts are the payment plan. Any later change needs both of you to accept again.</p>
      <button type="button">Accept plan</button>
      <button type="button">Cancel</button>
      <details>
        <summary>Show technical details</summary>
        <p className="faint">Document fingerprints sit here, next to the FX line.</p>
      </details>
    </div>
  );
}
