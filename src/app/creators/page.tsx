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

const GUIDE_URL =
  "https://higgsfield.ai/@higgsfield.studio/blogs/this-looks-like-a-console-game-it-s-a-web-page-claude-fable-5-2-coded";
const SKILL_PROMPT = "Use the Launch Title skill to get this game ready for the store.";

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

      <section className="shelf" id="claude">
        <h2>Make one with Claude</h2>
        <p className="shelf-note">No game yet? You can build one in a conversation and have it store-ready in four steps.</p>
        <ol className="steps walkthrough">
          <li>
            <span className="step-n">01</span>
            <h3>Make a game in Claude</h3>
            <p>Describe the game you want and keep refining it until it plays well. This guide shows how far one can go.</p>
            <a className="button" href={GUIDE_URL} target="_blank" rel="noopener">
              Read the guide
            </a>
          </li>
          <li>
            <span className="step-n">02</span>
            <h3>Add the Launch Title skill</h3>
            <p>Download it, then in Claude open Customize, Skills, press +, choose Upload a skill and pick the file. You only do this once.</p>
            <a className="button" href="/launch-title-game.zip" download>
              Download the skill
            </a>
          </li>
          <li>
            <span className="step-n">03</span>
            <h3>Ask Claude to get it ready</h3>
            <p>In the same conversation as your game, say:</p>
            <code className="say">{SKILL_PROMPT}</code>
            <p>Claude checks it plays on phones and desktops and hands you one file.</p>
          </li>
          <li>
            <span className="step-n">04</span>
            <h3>Add it to the store</h3>
            <p>Upload that file here, or post your game on X and tag @launchtitlegg add. Then give it a cover and screenshots.</p>
            {canSubmit(user) ? (
              <Link className="button" href="/submit">
                Add a game
              </Link>
            ) : (
              <a className="button" href="https://x.com/launchtitlegg" rel="noopener">
                Tag us on X
              </a>
            )}
          </li>
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
