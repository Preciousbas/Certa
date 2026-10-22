import Link from "next/link";

export default function NotFound() {
  return (
    <article className="card">
      <p className="eyebrow">404</p>
      <h1>That page is not on Certa.</h1>
      <p className="muted">The project, the stages, and the escrow are still where you left them.</p>
      <Link className="btn" href="/">
        Back to the timeline
      </Link>
    </article>
  );
}
