-- Posts that only quoted the bot's command, with a link to Launch Title itself, were read as
-- requests to add a game. Turn those down and drop any reply still waiting to be sent to them.
-- Safe to run twice.
DELETE FROM bot_replies
 WHERE state = 'QUEUED'
   AND in_reply_to IN (
     SELECT post_id FROM nominations
      WHERE source_url ~* '^https?://([a-z0-9-]+\.)*launchtitle\.(gg|games)(/|$)'
   );

UPDATE nominations
   SET state = 'REJECTED', error = 'Not a game: a link to Launch Title itself.', updated_at = now()
 WHERE state IN ('AWAITING_REVIEW', 'AWAITING_CREATOR', 'APPROVED', 'FAILED')
   AND source_url ~* '^https?://([a-z0-9-]+\.)*launchtitle\.(gg|games)(/|$)';
