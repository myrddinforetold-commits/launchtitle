-- Sponsor spots: a few quiet, labelled places in the store. Safe to run twice.
CREATE TABLE IF NOT EXISTS sponsors (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Where it shows: a band on the home page, a card on a game's page, or a line on the launch screen.
  placement   text NOT NULL CHECK (placement IN ('home', 'game', 'launch')),
  -- Who is behind it, shown beside the word Sponsored.
  name        text NOT NULL,
  headline    text NOT NULL DEFAULT '',
  body        text NOT NULL DEFAULT '',
  url         text NOT NULL,
  image_hash  text,
  active      boolean NOT NULL DEFAULT true,
  clicks      int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sponsors_live ON sponsors (placement) WHERE active;
