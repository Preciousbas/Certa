export type SpendDisplayRow = {
  key: string;
  at: string;
  project: string;
  purpose: string;
  amount: string;
  result: string;
  proof: string | null;
};

export function AgentSpend({ heading, rows }: { heading: string; rows: SpendDisplayRow[] }) {
  return (
    <section className="card">
      <p>{heading}</p>
      {rows.length === 0 ? (
        <p className="muted">No weather checks or network fees this month.</p>
      ) : (
        <table className="stage-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Purpose</th>
              <th className="amount">Amount</th>
              <th>Result</th>
              <th>Proof</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.at}</td>
                <td>{row.project}</td>
                <td>{row.purpose}</td>
                <td className="amount">{row.amount}</td>
                <td>
                  {row.result === "Good to pour" || row.result === "Rain likely" ? (
                    <span className={row.result === "Good to pour" ? "chip chip-released" : "chip chip-review"}>{row.result}</span>
                  ) : (
                    row.result
                  )}
                </td>
                <td>{row.proof ? <a href={row.proof}>Proof ↗</a> : "Waiting for the network record."}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <details>
        <summary>Show technical details</summary>
        <p>Escrow stays on Ethereum Sepolia. Weather checks are paid on Base Sepolia from the agent wallet, not from yours.</p>
      </details>
    </section>
  );
}
