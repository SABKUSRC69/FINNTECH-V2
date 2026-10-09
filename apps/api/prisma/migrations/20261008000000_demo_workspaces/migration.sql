CREATE TABLE "demo_workspaces" (
  "request_hash" CHAR(64) NOT NULL,
  "user_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "epoch" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "demo_workspaces_pkey" PRIMARY KEY ("request_hash"),
  CONSTRAINT "demo_workspaces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "demo_workspaces_user_id_key" ON "demo_workspaces"("user_id");
CREATE UNIQUE INDEX "demo_workspaces_session_id_key" ON "demo_workspaces"("session_id");
