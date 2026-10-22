import { cookies } from "next/headers";
import { PUBLISHED_FACTORY } from "../lib/published-chain";
import { SEPOLIA_CHAIN_ID, explorerAddress } from "../lib/explorer";
import { openSession } from "../../../src/server/auth/sessionOpen";
import { PageContainer } from "../components/ui/page";

const PITCH_SUB =
  "Certa holds construction money safely and pays each stage only when the work is done. The client uploads the contract or bill of quantities, Certa reads every figure from it, and both sides agree the payment stages.";

export default async function LandingPage() {
  const jar = await cookies();
  const token = jar.get("certa_session")?.value;
  let signedIn = false;
  if (token) {
    try {
      await openSession(token);
      signedIn = true;
    } catch {
      signedIn = false;
    }
  }
  const factory = process.env.ESCROW_FACTORY_ADDRESS || PUBLISHED_FACTORY;
  const support = process.env.SUPPORT_EMAIL || "support@example.com";
  const video = process.env.DEMO_VIDEO_URL;
  const year = new Date().getFullYear();
  return (
    <PageContainer>
      <main>
      <header className="landing-bar">
        <p className="wordmark">Certa.</p>
        <div className="actions">
          <a className="ui-btn ui-btn-primary" href="https://t.me/CertaApp_bot">
            Open in Telegram
          </a>
          <a className="ui-btn ui-btn-secondary" href={signedIn ? "/app" : "/login"}>
            {signedIn ? "Go to your projects" : "Sign in"}
          </a>
        </div>
      </header>
      <section className="landing-hero">
        <h1>Pay for building work only when it's done.</h1>
        <p>{PITCH_SUB}</p>
      </section>
      <section>
        <h2>How it works</h2>
        <div className="how-grid">
          <article className="card">
            <h3>Upload the contract</h3>
            <p>Certa reads the contract or BoQ and proposes payment stages. Both sides agree.</p>
          </article>
          <article className="card">
            <h3>Lock the money</h3>
            <p>The client locks the stage payments in an escrow nobody can touch alone.</p>
          </article>
          <article className="card">
            <h3>Photo, check, pay</h3>
            <p>The contractor sends site photos. Certa's AI checks the work and the client releases payment with one tap.</p>
          </article>
        </div>
      </section>
      <section>
        <h2>Who it's for</h2>
        <div className="how-grid">
          <article className="card">
            <h3>Clients</h3>
            <p>Pay only for work that the photos and the record support.</p>
          </article>
          <article className="card">
            <h3>Contractors</h3>
            <p>Get paid for each finished stage without learning crypto.</p>
          </article>
          <article className="card">
            <h3>Consultants</h3>
            <p>Certify work from the photos, with a record of the decision.</p>
          </article>
        </div>
      </section>
      <section className="card">
        <h2>Trust</h2>
        <p>
          Escrow contract: {factory.slice(0, 6)}…{factory.slice(-4)} (Ethereum Sepolia) —{" "}
          <a href={explorerAddress(SEPOLIA_CHAIN_ID, factory)}>View on Etherscan</a>
        </p>
        <p>Funds move only under the contract's rules: stage approval, spending cap, disputes lock money.</p>
      </section>
      {video ? (
        <section>
          <h2>Demo</h2>
          <video controls src={video} />
        </section>
      ) : null}
      <footer className="app-footer">
        <p>
          Network: Ethereum Sepolia (test network) · Escrow factory{" "}
          <a href={explorerAddress(SEPOLIA_CHAIN_ID, factory)}>
            {factory.slice(0, 6)}…{factory.slice(-4)} ↗
          </a>{" "}
          · Support: {support} · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
        </p>
        <p>© {year} Certa</p>
      </footer>
      </main>
    </PageContainer>
  );
}
