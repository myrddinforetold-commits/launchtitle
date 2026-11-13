-- Plays and saved games. Safe to run twice.

-- One row each time someone sits down with a game.
CREATE TABLE IF NOT EXISTS plays (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_slug   text NOT NULL REFERENCES games (slug) ON DELETE CASCADE,
  -- Set when the player is signed in. The play stays if the account goes.
  user_id     bigint REFERENCES users (id) ON DELETE SET NULL,
  -- A random id kept in a cookie, so a signed-out player is still one player.
  visitor     text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  -- How long the game was on screen, reported by the player as it runs.
  seconds     int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS plays_game ON plays (game_slug);
CREATE INDEX IF NOT EXISTS plays_user ON plays (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS plays_visitor ON plays (visitor, game_slug, started_at DESC);

-- Games a player has saved to their library.
CREATE TABLE IF NOT EXISTS saves (
  user_id     bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  game_slug   text NOT NULL REFERENCES games (slug) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_slug)
);
