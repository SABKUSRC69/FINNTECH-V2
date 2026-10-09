BEGIN;
CREATE TABLE cash_accounts (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES tracker_users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  name VARCHAR(100) NOT NULL CHECK (length(btrim(name)) > 0),
  balance NUMERIC(20,2) NOT NULL CHECK (balance >= 0 AND balance <> 'NaN'::numeric),
  currency VARCHAR(3) NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  as_of VARCHAR(10) NOT NULL CHECK (as_of ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND as_of = (as_of::date)::text),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  UNIQUE (owner_id, name)
);
CREATE TRIGGER preserve_owner BEFORE UPDATE ON cash_accounts
  FOR EACH ROW EXECUTE FUNCTION tracker_preserve_owner();
COMMIT;
