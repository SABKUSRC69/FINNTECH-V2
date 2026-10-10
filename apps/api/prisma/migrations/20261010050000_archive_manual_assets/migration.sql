-- Keep the record and audit trail; archived assets are excluded from current holdings.
ALTER TABLE manual_assets ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false;
