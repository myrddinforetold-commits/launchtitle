import type { Sponsor } from "@/lib/sponsors";

/**
 * A sponsor spot: always labelled, never animated, never over a game.
 * `wide` is the strip on the home page; `side` sits beside a game's details.
 */
export function SponsorSpot({ sponsor, shape }: { sponsor: Sponsor | null; shape: "wide" | "side" }) {
  if (!sponsor) return null;
  return (
    <a className={`sponsor sponsor-${shape}`} href={`/api/sponsors/${sponsor.id}/go`} target="_blank" rel="sponsored noopener" aria-label={`Sponsored by ${sponsor.name}: ${sponsor.headline}`}>
      {sponsor.imageHash && (
        // eslint-disable-next-line @next/next/no-img-element -- served from our own storage
        <img src={`/media/${sponsor.imageHash}`} alt="" loading="lazy" />
      )}
      <span className="sponsor-copy">
        <small>Sponsored · {sponsor.name}</small>
        <b>{sponsor.headline}</b>
        {sponsor.body && <span>{sponsor.body}</span>}
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 17 17 7M9 7h8v8" />
      </svg>
    </a>
  );
}
