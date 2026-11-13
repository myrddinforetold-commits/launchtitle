-- Who added each game. Safe to run twice.
ALTER TABLE games ADD COLUMN IF NOT EXISTS creator_user_id bigint REFERENCES users (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS games_creator_user_id ON games (creator_user_id);
