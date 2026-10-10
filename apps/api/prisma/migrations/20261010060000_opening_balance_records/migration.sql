-- A record dated before its cash account's opening date can be kept as history that is already
-- included in that opening balance. It moves no money, so it never carries a cash link.
ALTER TABLE finance_transactions ADD COLUMN cash_in_opening_balance BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE finance_transactions ADD CONSTRAINT finance_transactions_opening_balance_check CHECK (NOT cash_in_opening_balance OR cash_account_id IS NULL);
ALTER TABLE crypto_trades ADD COLUMN cash_in_opening_balance BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crypto_trades ADD CONSTRAINT crypto_trades_opening_balance_check CHECK (NOT cash_in_opening_balance OR cash_account_id IS NULL);
ALTER TABLE stock_trades ADD COLUMN cash_in_opening_balance BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stock_trades ADD CONSTRAINT stock_trades_opening_balance_check CHECK (NOT cash_in_opening_balance OR cash_account_id IS NULL);
