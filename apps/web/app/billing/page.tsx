export default function BillingPage() {
  return (
    <div>
      <p className="eyebrow">Plan</p>
      <h1>Per active project. Pause when the site sleeps.</h1>
      <div className="card">
        <div className="row">
          <span>Monthly</span>
          <span>₦150,000</span>
        </div>
        <div className="row">
          <span>Yearly</span>
          <span>₦1,500,000</span>
        </div>
        <div className="row">
          <span>Release fee</span>
          <span>0.5%</span>
        </div>
      </div>
      <p className="muted">Gas and the agent’s paid checks come out of the workspace allowance. People on site do not buy gas.</p>
      <form action="/api/mini/plan" method="post">
        <button type="submit">Pause project</button>
      </form>
    </div>
  );
}
