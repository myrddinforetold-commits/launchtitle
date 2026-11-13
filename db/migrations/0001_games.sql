-- Games and their imported builds.
-- Migrations must be safe to run twice (IF NOT EXISTS), because two builds can start at once.

CREATE TABLE IF NOT EXISTS games (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Also the game's subdomain on the play domain.
  slug           text NOT NULL UNIQUE,
  title          text NOT NULL,
  state          text NOT NULL CHECK (state IN (
                   'NOMINATED', 'CONFIRMED', 'HOSTED', 'CLAIMED', 'PAYABLE',
                   'PAUSED', 'OPTED_OUT', 'REMOVED')),
  -- The build players get. A pointer on the game, not a flag on each build,
  -- so switching builds is one write and there is never more than one live build.
  active_version text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Builds are immutable: rows are added and never changed.
CREATE TABLE IF NOT EXISTS versions (
  seq              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id          bigint NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  -- Derived from the build's file list and contents.
  version          text NOT NULL,
  -- Path -> { hash, size, type }. The hash is the key in file storage.
  manifest         jsonb NOT NULL,
  total_bytes      bigint NOT NULL,
  source           jsonb NOT NULL,
  external_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, version)
);
