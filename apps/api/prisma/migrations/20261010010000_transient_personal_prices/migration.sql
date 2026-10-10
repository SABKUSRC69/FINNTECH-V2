BEGIN;
-- Personal Tiingo closes are disposable provider caches, never accounting records.
DELETE FROM daily_close_prices WHERE source = 'Tiingo EOD' AND owner_id IS NOT NULL;
ALTER TABLE daily_close_prices ADD CONSTRAINT no_persistent_personal_tiingo
 CHECK (source <> 'Tiingo EOD' OR owner_id IS NULL);
COMMIT;
