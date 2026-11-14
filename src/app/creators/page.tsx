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
  { n: "04", title: "You get paid", body: "When the store earns, 80% goes to the people who made the games, shared by how much each game is played." },
];

const FACTS = [
  { big: "Free", small: "to list and to host" },
  { big: "80%", small: "of earnings to creators" },
  { big: "Minutes", small: "from tag to live" },
  { big: "Yours", small: "to pause any time" },
];

/** What the store is built to support. Names only: these marks belong to their owners. */
const SUPPORT = [
  { label: "Runs on the open web", items: ["WebGL", "WebGPU", "Canvas", "WebAssembly", "Web Audio"] },
  { label: "Engines and libraries", items: ["Three.js", "Phaser", "PixiJS", "Babylon.js", "PlayCanvas"] },
  { label: "Built in a conversation with", items: ["Claude", "ChatGPT", "Gemini"] },
  { label: "Bring it from", items: ["Vercel", "Netlify", "GitHub Pages", "A zip file", "A single HTML file"] },
];

const POOL_SOURCES = [
  { status: "Opening", name: "The launch pool", body: "Money Launch Title sets aside each week to pay early creators. All of it goes to creators." },
  { status: "Next", name: "Sponsor spots", body: "A few labelled places around games, never over them. 80% of what they bring in goes to creators." },
  { status: "Later", name: "Tips and memberships", body: "Players backing the games they love. 80% goes to creators." },
];

const PROMISES = [
  { title: "It stays yours", body: "You made it, you keep it. Launch Title hosts and shows your game; it does not take it over." },
  { title: "Pause it yourself", body: "One click on your game's page takes it off the store, and one click puts it back." },
  { title: "Credited to you", body: "Your handle is on the game, its share card and your own creator page, with a link to you on X." },
  { title: "Played your way", body: "We host a copy on our servers, or the game plays from your own site if it needs its server." },
  { title: "Checked before it lists", body: "Every new game is opened in a test browser to see that it loads and finds its files." },
  { title: "Kept apart", body: "Each game runs at its own address, walled off from the store and from every other game." },
];

const QUESTIONS = [
  { q: "Does it cost anything?", a: "No. Listing and hosting are free." },
  { q: "My game needs a server. Can it be here?", a: "Yes. A game with logins, saves or a leaderboard plays from your own site inside the store, so everything keeps working." },
  { q: "What can I bring?", a: "A link to where the game is already live, a zip of the built game, or a single HTML file. If it runs in a browser, it can be here." },
  { q: "How do I update my game?", a: "Add it again under the same name. Players get the new version at once. A game that plays from your site updates whenever you do." },
  { q: "Who can add games right now?", a: "Anyone can be tagged on X. Adding games yourself from this page is by invitation while we choose the first Launch Titles." },
];

const GUIDE_URL =
  "https://higgsfield.ai/@higgsfield.studio/blogs/this-looks-like-a-console-game-it-s-a-web-page-claude-fable-5-2-coded";
const SKILL_PROMPT = "Use the Launch Title skill to get this game ready for the store.";

export default async function Creators() {
  const user = await currentUser();
  return (
    <>
      <section className="pitch">
        <div className="pitch-copy">
          <p className="kicker">For creators</p>
          <h1>Your game deserves a launch.</h1>
          <p>
            Launch Title is a store for new web games. Tag your game on X and it gets its own page, a place on the
            shelves and players who press Play, with nothing to install.
          </p>
          <div className="actions">
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
            <a className="button quiet" href="#royalties">
              How royalties work
            </a>
          </div>
        </div>
        <ul className="facts">
          {FACTS.map((fact) => (
            <li key={fact.big}>
              <b>{fact.big}</b>
              <span>{fact.small}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="shelf" id="support">
        <h2>Built to support</h2>
        <div className="support">
          {SUPPORT.map((group) => (
            <div key={group.label}>
              <h3>{group.label}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="fine">These names belong to their owners. They are listed to show what Launch Title is built to support.</p>
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

      <section className="shelf royalties" id="royalties">
        <h2>How royalties work</h2>
        <div className="split-panel">
          <div>
            <h3>When the store earns, creators get 80%.</h3>
            <p>The other 20% keeps the store running: hosting, the people who curate it, and bringing in players.</p>
          </div>
          <div className="split" role="img" aria-label="80% to creators, 20% to Launch Title">
            <span className="split-creators">
              <b>80%</b> creators
            </span>
            <span className="split-store">
              <b>20%</b> store
            </span>
          </div>
        </div>

        <ol className="steps flow">
          <li>
            <span className="step-n">01</span>
            <h3>Players play</h3>
            <p>Every play of your game is counted, and so is every minute it stays on screen.</p>
          </li>
          <li>
            <span className="step-n">02</span>
            <h3>The week has a pool</h3>
            <p>Each week, the money the store has to share goes into one pool for creators.</p>
          </li>
          <li>
            <span className="step-n">03</span>
            <h3>The pool is split by playtime</h3>
            <p>Your game&apos;s share of the week&apos;s playtime is its share of the pool. More play, more royalty.</p>
          </li>
        </ol>

        <div className="example">
          <p className="fine">An example with made-up numbers</p>
          <dl>
            <div>
              <dt>The week&apos;s pool</dt>
              <dd>$1,000</dd>
            </div>
            <div>
              <dt>Your game&apos;s share of playtime</dt>
              <dd>12%</dd>
            </div>
            <div className="total">
              <dt>Your royalty that week</dt>
              <dd>$120</dd>
            </div>
          </dl>
        </div>

        <h3 className="sub">Where the pool comes from</h3>
        <ul className="sources">
          {POOL_SOURCES.map((source) => (
            <li key={source.name}>
              <span className={`status ${source.status.toLowerCase()}`}>{source.status}</span>
              <div>
                <b>{source.name}</b>
                <p>{source.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <h3 className="sub">The rules, in plain words</h3>
        <ul className="rules">
          <li>Only real play counts. Idle tabs and plays made to farm the pool are left out.</li>
          <li>A cap stops any one game taking a whole week&apos;s pool, so a single hit does not empty it for everyone else.</li>
          <li>To be paid, sign in with X and claim your game. If someone else tagged it, its royalties are held for you until you do.</li>
          <li>Royalties are paid after payment processing costs.</li>
        </ul>

        <div className="today">
          <h3>Where this stands today</h3>
          <p>
            Counting is live: every game&apos;s plays and playtime are recorded from its first day in the store. Royalties
            are not being paid yet. They begin with the first weekly pool, which we will announce on{" "}
            <a href="https://x.com/launchtitlegg" rel="noopener">
              @launchtitlegg
            </a>
            .
          </p>
        </div>
      </section>

      <section className="shelf" id="promises">
        <h2>What you can count on</h2>
        <ul className="promises">
          {PROMISES.map((promise) => (
            <li key={promise.title}>
              <b>{promise.title}</b>
              <span>{promise.body}</span>
            </li>
          ))}
        </ul>
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

      <section className="shelf" id="questions">
        <h2>Questions</h2>
        <div className="questions">
          {QUESTIONS.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="strip">
        <div>
          <h2>Ready when you are</h2>
          <p>Tag @launchtitlegg under your game on X, or add it here.</p>
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

      {user && !canSubmit(user) && (
        <p className="notice">
          Adding games yourself is by invitation while we choose the first Launch Titles. Tag @launchtitlegg under your
          game on X and we will take a look.
        </p>
      )}
    </>
  );
}
