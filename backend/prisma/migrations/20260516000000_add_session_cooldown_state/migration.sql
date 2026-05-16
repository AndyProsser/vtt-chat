-- Add COOLDOWN to the SessionState enum.
-- COOLDOWN is entered when the DM ends the session (ACTIVE/PAUSED → COOLDOWN).
-- The cooldown timer expires and the session auto-transitions to ENDED.
ALTER TYPE "SessionState" ADD VALUE IF NOT EXISTS 'COOLDOWN';
