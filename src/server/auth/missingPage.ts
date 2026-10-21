export function missingPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Certa</title>
<style>
  :root { --text:#1e293b; --muted:#64748b; --border:#e2e8f0; --bg:#f8fafc; --card:#ffffff; --action:#f97316; --action-ink:#1e293b; --focus:#c2410c; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100%; background:var(--bg); color:var(--text); font-family:Inter, sans-serif; font-size:14px; line-height:1.45; }
  main { max-width:720px; margin:0 auto; padding:1.4rem 1rem 3rem; }
  .wordmark { font-weight:800; letter-spacing:-0.03em; margin:0 0 1rem; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:0.9rem 1rem 1rem; }
  .eyebrow { font-size:11px; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); margin:0 0 0.45rem; }
  h1 { font-size:22px; line-height:1.2; font-weight:800; letter-spacing:-0.02em; margin:0 0 0.45rem; }
  .muted { color:var(--muted); }
  a { color:inherit; }
  .btn { display:inline-flex; align-items:center; border:0; background:var(--action); color:var(--action-ink); border-radius:12px; min-height:44px; padding:0.7rem 1.1rem; font:700 14px/1 Inter, sans-serif; text-decoration:none; }
  .btn:hover { transform:scale(0.95); background:#ea6a0c; }
  :focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
</style>
</head>
<body>
<main>
  <p class="wordmark">Certa.</p>
  <article class="card">
    <p class="eyebrow">404</p>
    <h1>That page is not on Certa.</h1>
    <p class="muted">The project, the stages, and the escrow are still where you left them.</p>
    <a class="btn" href="/">Back to the timeline</a>
  </article>
</main>
</body>
</html>`;
}
