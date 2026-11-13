-- People who have signed in with X, and their sessions.
-- Safe to run twice.

CREATE TABLE IF NOT EXISTS users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- X's permanent numeric id. Handles change; this does not, so it is what we match on.
  x_account_id  text NOT NULL UNIQUE,
  handle        text NOT NULL,
  name          text NOT NULL DEFAULT '',
  role          text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'creator', 'curator', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  -- SHA-256 of the cookie value. The value itself is never stored, so a copy
  -- of this table cannot be used to sign in as anyone.
  token_hash  text PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at);
