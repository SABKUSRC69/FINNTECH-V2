-- Forward only. Apply exclusively to the empty, guarded phase 3A target in this phase.
CREATE TABLE auth_recovery_enrollments (
  user_id UUID PRIMARY KEY REFERENCES auth_users(id) ON DELETE RESTRICT,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE auth_delivery_jobs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  fingerprint TEXT NOT NULL UNIQUE,
  kind VARCHAR(16) NOT NULL,
  envelope TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  next_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(32),
  CONSTRAINT delivery_kind CHECK (kind IN ('verify', 'reset', 'notice')),
  CONSTRAINT delivery_status CHECK (status IN ('PENDING', 'SENT', 'EXPIRED', 'FAILED')),
  CONSTRAINT delivery_attempts CHECK (attempts BETWEEN 0 AND 4)
);
CREATE INDEX auth_delivery_jobs_status_next_at_idx ON auth_delivery_jobs(status, next_at);
CREATE TABLE auth_recovery_rates (
  key TEXT NOT NULL,
  "window" TIMESTAMPTZ(3) NOT NULL,
  hits INTEGER NOT NULL CHECK (hits > 0),
  PRIMARY KEY (key, "window")
);
