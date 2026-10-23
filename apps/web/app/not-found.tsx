export default function NotFound() {
  return (
    <article>
      <h1>We couldn't find that page.</h1>
      <p className="muted">The address does not match a project or a screen.</p>
      <div className="actions">
        <a className="ui-btn ui-btn-secondary" href="/app">Go to your projects</a>
        <a className="ui-btn ui-btn-secondary" href="/">Home</a>
      </div>
    </article>
  );
}
