-- Forward-only correction: never rewrite an already applied migration.
BEGIN;
ALTER TABLE finance_transactions
  DROP CONSTRAINT finance_transactions_owner_id_category_id_type_fkey;
ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_owner_id_category_id_type_fkey
  FOREIGN KEY (owner_id, category_id, type)
  REFERENCES finance_categories (owner_id, id, type)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE budgets
  DROP CONSTRAINT budgets_owner_id_category_id_category_type_fkey;
ALTER TABLE budgets
  ADD CONSTRAINT budgets_owner_id_category_id_category_type_fkey
  FOREIGN KEY (owner_id, category_id, category_type)
  REFERENCES finance_categories (owner_id, id, type)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
COMMIT;
