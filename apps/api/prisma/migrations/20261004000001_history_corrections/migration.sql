BEGIN;
ALTER TABLE finance_transactions
  ADD COLUMN voided_at TIMESTAMPTZ(3),
  ADD COLUMN void_reason VARCHAR(500),
  ADD CONSTRAINT finance_void_rules CHECK (
    (voided_at IS NULL AND void_reason IS NULL)
    OR (voided_at IS NOT NULL AND void_reason IS NOT NULL AND length(btrim(void_reason)) > 0)
  );
ALTER TABLE crypto_trades
  ADD COLUMN voided_at TIMESTAMPTZ(3),
  ADD COLUMN void_reason VARCHAR(500),
  ADD CONSTRAINT crypto_void_rules CHECK (
    (voided_at IS NULL AND void_reason IS NULL)
    OR (voided_at IS NOT NULL AND void_reason IS NOT NULL AND length(btrim(void_reason)) > 0)
  );
-- Originals remain readable; corrections insert replacements instead of changing input values.
COMMIT;
