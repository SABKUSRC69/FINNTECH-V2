CREATE TABLE runtime_boundaries (
  id TEXT PRIMARY KEY CHECK (id = 'singleton'),
  mode TEXT NOT NULL CHECK (mode IN ('real', 'real-rehearsal')),
  database_name TEXT NOT NULL,
  database_role TEXT NOT NULL,
  origin TEXT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE real_runtime_counters (
  key TEXT PRIMARY KEY,
  "window" TIMESTAMPTZ(3) NOT NULL,
  hits INTEGER NOT NULL CHECK (hits >= 0)
);
ALTER TABLE auth_delivery_jobs ADD COLUMN first_attempt_at TIMESTAMPTZ(3);
