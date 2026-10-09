-- PostgreSQL NaN compares above finite numbers, so ordinary nonnegative checks are insufficient.
ALTER TABLE stock_trades ADD CONSTRAINT stock_finite CHECK (
 quantity<>'NaN'::numeric AND price<>'NaN'::numeric AND fee<>'NaN'::numeric
 AND gross<>'NaN'::numeric AND cost_removed<>'NaN'::numeric AND realized_pnl<>'NaN'::numeric
);
ALTER TABLE stock_holdings ADD CONSTRAINT stock_holding_finite CHECK (
 quantity<>'NaN'::numeric AND total_cost<>'NaN'::numeric AND realized_pnl<>'NaN'::numeric
);
ALTER TABLE manual_assets ADD CONSTRAINT manual_finite_units CHECK (
 value<>'NaN'::numeric AND (cost IS NULL OR cost<>'NaN'::numeric)
 AND (quantity IS NULL OR (quantity<>'NaN'::numeric AND length(btrim(unit))>0))
 AND length(btrim(name))>0
);
