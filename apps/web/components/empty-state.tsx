export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card empty-state">
      <p className="eyebrow">Empty</p>
      <h1>{title}</h1>
      <p className="muted">{body}</p>
    </div>
  );
}
