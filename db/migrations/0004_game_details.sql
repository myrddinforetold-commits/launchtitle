-- What a game's page shows besides the game itself. Safe to run twice.
ALTER TABLE games ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
-- The cover image, as a key in file storage plus its type.
ALTER TABLE games ADD COLUMN IF NOT EXISTS cover_hash text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS cover_type text;
