-- The start-up check: does a newly added game load and draw something? Safe to run twice.
-- 'none' is a game added before the check existed, or one a person chose to list anyway.
ALTER TABLE games ADD COLUMN IF NOT EXISTS check_state text NOT NULL DEFAULT 'none'
  CHECK (check_state IN ('none', 'pending', 'passed', 'failed', 'skipped'));
-- What the check found, in plain words, for the people who manage the game.
ALTER TABLE games ADD COLUMN IF NOT EXISTS check_note text NOT NULL DEFAULT '';
-- When the state last changed. A game left pending too long is listed anyway.
ALTER TABLE games ADD COLUMN IF NOT EXISTS check_at timestamptz;
-- Games already in the store get checked once too. Only untouched ones: check_at is set from then on.
UPDATE games SET check_state = 'pending', check_at = now()
 WHERE check_state = 'none' AND check_at IS NULL AND state IN ('HOSTED', 'CLAIMED', 'PAYABLE');
