-- Forward-only Auth foundation; prior F1.4 migrations remain unchanged.
CREATE TABLE "auth_users" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");

CREATE TABLE "auth_sessions" (
  "id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "token" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" UUID NOT NULL,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "auth_sessions_token_key" ON "auth_sessions"("token");
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

CREATE TABLE "auth_accounts" (
  "id" UUID NOT NULL,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" TIMESTAMPTZ(3),
  "refresh_token_expires_at" TIMESTAMPTZ(3),
  "scope" TEXT,
  "password" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "auth_accounts_provider_id_account_id_key" ON "auth_accounts"("provider_id", "account_id");
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts"("user_id");

CREATE TABLE "auth_verifications" (
  "id" UUID NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "auth_verifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications"("identifier");

ALTER TABLE "auth_identities" ADD COLUMN "auth_user_id" UUID;
CREATE UNIQUE INDEX "auth_identities_auth_user_id_key" ON "auth_identities"("auth_user_id");
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_auth_user_id_fkey"
  FOREIGN KEY ("auth_user_id") REFERENCES "auth_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identity_subject_matches_user"
  CHECK (("provider" = 'better-auth' AND "auth_user_id" IS NOT NULL AND "subject" = "auth_user_id"::text AND "verified_at" IS NOT NULL)
    OR ("provider" <> 'better-auth' AND "auth_user_id" IS NULL));
