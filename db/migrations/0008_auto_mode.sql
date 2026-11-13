-- Let an approved request be brought in whichever way suits the game. Safe to run twice.
ALTER TABLE nominations DROP CONSTRAINT IF EXISTS nominations_mode_check;
ALTER TABLE nominations ADD CONSTRAINT nominations_mode_check CHECK (mode IN ('auto', 'copy', 'link'));
ALTER TABLE nominations ALTER COLUMN mode SET DEFAULT 'auto';
