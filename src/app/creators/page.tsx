import type { Metadata } from "next";
import Link from "next/link";

import { currentUser, xApp } from "@/lib/auth/current";
import { canSubmit } from "@/lib/auth/sessions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Creators" };

const STEPS = [
  { n: "01", title: "Tag it", body: "Reply to your game's post on X with @launchtitlegg add. Someone else can nominate you; nothing goes up until you say yes." },
  { n: "02", title: "We host it", body: "Your game gets its own page and plays right here, full screen, on a phone or a desk. Games with their own server play from your site." },
  { n: "03", title: "It gets a launch", body: "Every week we pick the best new games as Launch Titles and put them at the front of the store." },
  { n: "04", title: "You get paid", body: "When a game earns, 80% goes to the person who made it." },
];

export default async function Creators() {
  const user = await currentUser();
  return (
    <>
      <header className="page-head">
        <p className="crumb">Creators</p>
        <h1>Bring your game</h1>
      </header>

      <section className="strip">
        <div>
          <h2>Every game deserves a launch</h2>
          <p>Launch Title is a store for new web games. If yours runs in a browser, it can be here.</p>
        </div>
        {canSubmit(user) ? (
          <Link className="button primary" href="/submit">
            Add a game
          </Link>
        ) : !user && xApp() ? (
          <a className="button primary" href="/api/auth/x/start">
            Sign in with X
          </a>
        ) : (
          <a className="button primary" href="https://x.com/launchtitlegg" rel="noopener">
            Send us your game
          </a>
        )}
      </section>

      <section className="shelf" id="how">
        <h2>How it works</h2>
        <ol className="steps">
          {STEPS.map((step) => (
            <li key={step.n}>
              <span className="step-n">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {user && !canSubmit(user) && (
        <p className="notice">
          Adding games yourself is by invitation while we choose the first Launch Titles. Tag @launchtitlegg under your
          game on X and we will take a look.
        </p>
      )}
    </>
  );
}
