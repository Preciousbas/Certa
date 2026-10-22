export default function ContractPage() {
  return (
    <div>
      <p className="eyebrow">Contract</p>
      <h1>Payment plan</h1>
      <p className="muted">The accepted version is locked. A later change needs both sides to accept again.</p>
      <details>
        <summary>Show technical details</summary>
        <p className="faint">Document fingerprints are the first 12 characters of each file sha256.</p>
      </details>
    </div>
  );
}
