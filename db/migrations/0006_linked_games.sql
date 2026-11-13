-- Games that play from their creator's own site instead of from a copy. Safe to run twice.
ALTER TABLE games ADD COLUMN IF NOT EXISTS external_url text;
-- How an approved request should come in: 'copy' the files, or 'link' to the creator's site.
ALTER TABLE nominations ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'copy' CHECK (mode IN ('copy', 'link'));
