-- SPEC-002: stable user identity keyed on spotify_id.
-- Makes spotify_id the canonical key for the login upsert and the lookups that
-- back the player/refresh endpoints.

-- 1. Backfill spotify_id from the canonical profile URL tail (…/user/<id>).
UPDATE users
SET spotify_id = substring(spotify_url FROM '[^/]+$')
WHERE spotify_id IS NULL
  AND spotify_url IS NOT NULL;

-- 2. Normalize empty refresh tokens to NULL so the refresh cron's filter can be
--    a simple IS NOT NULL (the upsert/refresh paths now write NULL, never '').
UPDATE users SET refresh_token = NULL WHERE refresh_token = '';

-- 3. De-dupe any pre-existing duplicate accounts, keeping the most recently
--    updated row per spotify_id.
DELETE FROM users a
USING users b
WHERE a.spotify_id = b.spotify_id
  AND a.spotify_id IS NOT NULL
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

-- 4. Enforce uniqueness so ON CONFLICT (spotify_id) in the login upsert is valid.
--    (NULL spotify_id rows remain allowed — Postgres treats NULLs as distinct.)
CREATE UNIQUE INDEX IF NOT EXISTS users_spotify_id_key ON users (spotify_id);
