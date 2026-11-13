-- What a game's page shows beyond its cover and description. Safe to run twice.
-- Screenshots: a list of { hash, type }, each a key in file storage.
ALTER TABLE games ADD COLUMN IF NOT EXISTS screenshots jsonb NOT NULL DEFAULT '[]'::jsonb;
-- How to play: the controls and the aim, in the creator's words.
ALTER TABLE games ADD COLUMN IF NOT EXISTS how_to text NOT NULL DEFAULT '';
-- What the game is made for. 'any' plays well on both.
ALTER TABLE games ADD COLUMN IF NOT EXISTS devices text NOT NULL DEFAULT 'any' CHECK (devices IN ('any', 'phone', 'desktop'));
