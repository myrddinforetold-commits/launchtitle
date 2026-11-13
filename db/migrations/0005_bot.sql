-- The tag-to-add bot. Safe to run twice.

-- One row: the X account the bot posts as, and where it has read up to.
CREATE TABLE IF NOT EXISTS bot (
  id                 int PRIMARY KEY CHECK (id = 1),
  x_account_id       text NOT NULL,
  handle             text NOT NULL,
  access_token       text NOT NULL,
  refresh_token      text NOT NULL,
  access_expires_at  timestamptz NOT NULL,
  connected_at       timestamptz NOT NULL DEFAULT now(),
  -- The newest mention already handled.
  since_id           text,
  -- Doubles as a lock: only one check runs at a time, and not more than once a minute.
  poll_started_at    timestamptz NOT NULL DEFAULT 'epoch'
);

-- Each request to add a game, from the first tag to the game going live.
CREATE TABLE IF NOT EXISTS nominations (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The post that asked. Unique, so reading the same mention twice changes nothing.
  post_id           text NOT NULL UNIQUE,
  conversation_id   text NOT NULL,
  nominator_x_id    text NOT NULL,
  nominator_handle  text NOT NULL,
  creator_x_id      text,
  creator_handle    text NOT NULL,
  source_url        text NOT NULL,
  state             text NOT NULL CHECK (state IN (
                      'AWAITING_CREATOR', 'AWAITING_REVIEW', 'APPROVED', 'LIVE',
                      'DECLINED', 'REJECTED', 'FAILED', 'EXPIRED', 'REMOVED')),
  title             text,
  game_slug         text,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nominations_state ON nominations (state);
CREATE INDEX IF NOT EXISTS nominations_conversation ON nominations (conversation_id);
CREATE INDEX IF NOT EXISTS nominations_source_url ON nominations (source_url);

-- Replies waiting to be posted, and those already posted.
CREATE TABLE IF NOT EXISTS bot_replies (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  in_reply_to   text NOT NULL,
  body          text NOT NULL,
  state         text NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED', 'SENT', 'FAILED')),
  sent_post_id  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz
);

CREATE INDEX IF NOT EXISTS bot_replies_state ON bot_replies (state);
