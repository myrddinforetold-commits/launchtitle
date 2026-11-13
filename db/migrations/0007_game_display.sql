-- How a game is shown on a wide screen. Safe to run twice.
-- 'fill' uses the whole window. 'portrait' keeps a phone-shaped screen in the middle, for games made for phones.
ALTER TABLE games ADD COLUMN IF NOT EXISTS display text NOT NULL DEFAULT 'fill' CHECK (display IN ('fill', 'portrait'));
