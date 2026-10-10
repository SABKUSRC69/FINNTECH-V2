BEGIN;
-- End-of-day closes. scope='shared' rows come from a server key whose licence allows display to every
-- account; scope=<owner uuid> rows were fetched with that owner's own personal key and are only ever
-- read back for that owner. Owner rows cascade with the owner on an approved privacy purge.
CREATE TABLE daily_close_prices (
 id UUID PRIMARY KEY,
 source VARCHAR(32) NOT NULL CHECK(length(source)>0),
 scope VARCHAR(36) NOT NULL DEFAULT 'shared',
 owner_id UUID REFERENCES tracker_users(id) ON DELETE CASCADE,
 symbol VARCHAR(16) NOT NULL CHECK(symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
 trading_date DATE NOT NULL CHECK(EXTRACT(ISODOW FROM trading_date) BETWEEN 1 AND 5),
 close NUMERIC(38,18) NOT NULL CHECK(close>0 AND close<'1000000000'::numeric),
 currency VARCHAR(3) NOT NULL CHECK(currency='USD'),
 price_type VARCHAR(16) NOT NULL DEFAULT 'CLOSE' CHECK(price_type='CLOSE'),
 fetched_at TIMESTAMPTZ(3) NOT NULL,
 CHECK((scope='shared' AND owner_id IS NULL) OR (owner_id IS NOT NULL AND scope=owner_id::text)),
 UNIQUE(source,scope,symbol,trading_date)
);
CREATE INDEX daily_close_prices_owner ON daily_close_prices(owner_id) WHERE owner_id IS NOT NULL;

-- One personal market-data key per owner, AES-256-GCM encrypted by the server (AAD = owner id).
-- Never exported in owner backups; removal clears the ciphertext instead of deleting the row.
CREATE TABLE owner_market_keys (
 owner_id UUID PRIMARY KEY REFERENCES tracker_users(id) ON DELETE CASCADE,
 provider VARCHAR(16) NOT NULL CHECK(provider='TIINGO'),
 ciphertext BYTEA CHECK(ciphertext IS NULL OR octet_length(ciphertext) BETWEEN 30 AND 512),
 key_hint VARCHAR(4) CHECK(key_hint IS NULL OR key_hint ~ '^[A-Za-z0-9]{4}$'),
 status VARCHAR(16) NOT NULL CHECK(status IN ('ACTIVE','REMOVED')),
 personal_use_confirmed_at TIMESTAMPTZ(3) NOT NULL,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK((status='ACTIVE' AND ciphertext IS NOT NULL AND key_hint IS NOT NULL) OR (status='REMOVED' AND ciphertext IS NULL AND key_hint IS NULL))
);
CREATE TRIGGER preserve_owner BEFORE UPDATE ON owner_market_keys FOR EACH ROW EXECUTE FUNCTION tracker_preserve_owner();
COMMIT;
