# Recovery / verification — isolated phase 3A only

Default runtime is unchanged and recovery is **off**. Do not add the test flags to owner env. Do not migrate the owner database during this phase. No external email provider, recovery codes, email change, account linking or administrator bypass is implemented.

## Dedicated rehearsal target

Compose file `compose.recovery-3a.yaml`, project `finntech-recovery-3a-20261007`, role `recovery_fixture`, database `finntech_recovery_3a_20261007`, PostgreSQL loopback 5441, API/web origin `http://127.0.0.1:4197`. Named volume retained when stopping. Existing owner/test projects, ports and volumes are not targets.

Secrets for the performed rehearsal are generated locally into `.phase3a-20261007.local/runtime.env`, not committed or printed. That directory has Windows ACL inheritance removed, allowing Admin and SYSTEM. The restricted mailbox contains encrypted synthetic messages only; there is no mailbox HTTP service or token-read API. The backend harness decrypts internally. This sink is a delivery test channel, not proof of real email delivery or a usable recovery channel for real data.

Start/stop existing rehearsal (do not rerun preparation on a nonempty target):

```powershell
docker compose --env-file .phase3a-20261007.local/runtime.env -f compose.recovery-3a.yaml up -d --pull never --wait
node --no-strip-types --env-file=.phase3a-20261007.local/runtime.env apps/api/dist/server.js
# Stop only the terminal/runtime you started. Keep volumes.
docker compose --env-file .phase3a-20261007.local/runtime.env -f compose.recovery-3a.yaml stop postgres-recovery-3a
```

Health: GET `/api/health` checks database connection; process `status:ok` alone is not DB readiness. `/api/auth-capabilities` reports actual server capabilities. Dedicated flags are rejected outside the exact test DB/role/port/origin and non-production environment. Delivery workers run only when that integration is present. No `VITE_*` secrets.

The guarded `scripts/recovery-3a-prepare.mjs` accepts only an empty exact target before forward migrations. Nonempty target is refused without reset/drop/truncate. Repeated integration rehearsals append new randomly identified synthetic accounts and preserve previous attempts. Do not clear the target to make tests pass. A future fresh rehearsal must first add a separately reviewed target guard/compose configuration; do not point the existing guard at another database.

## Flow and consistency

New test signup is one outer PostgreSQL transaction: Better Auth creates user/credential, explicit recovery enrollment, hashed verification challenge binding and encrypted outbox job. No signup session. Existing unverified synthetic users must prove their current Better Auth password before enrollment/verification. `AuthIdentity.verifiedAt` / owner identity `VERIFIED` do not mean `AuthUser.emailVerified`.

Verification link lands on `/account/verify`; GET does not consume. Frontend reads the token into memory and clears the address-bar query before API reads. Confirm POST consumes the digest binding and invokes Better Auth's signed-JWT verification in the same transaction. Replayed/expired/wrong-session-subject tokens fail; no automatic login.

Reset request answers generically for unknown/unverified/verified, with a 500ms response floor. Only enrolled, unblocked, email-verified synthetic users generate a Better Auth reset challenge and a durable job. Callback and link origin are exact configured values; client Host/forwarding/external callback is rejected in this dedicated runtime. Delivery is outside the response.

Reset confirm uses the Better Auth reset endpoint on a transaction-scoped Prisma adapter (`transaction:false` to avoid nested transactions). The outer transaction locks the AuthUser row first; Better Auth consumes its hashed challenge, hashes/writes the credential, executes hook, invalidates all remaining subject challenges and pending mail, creates a password-change notice and deletes sessions. Only then may the outer commit return success. Exceptions roll back every step; no security barrier is needed for the observed all-or-nothing protocol. No ledger lock is acquired in these flows; financial data and owner mapping are never changed by recovery.

If reset response is lost, the UI clears password fields and does not submit another password automatically. Use normal login/new-link flow; there is no credential receipt/status endpoint. Existing finance/cash/crypto/backup pending payloads and idempotency keys are untouched. Recovery does not reuse or replace them.

## Delivery / failure handling

AES-256-GCM minimal envelope holds the synthetic recipient, kind and configured link. Key is server-only. Fingerprints are keyed digests; database verification identifiers are SHA-256 digests rather than raw tokens. Neither plaintext links nor tokens go in evidence/logs/financial JSON backups. Full DB backups still require separate key custody and restore policy in 3B.

Workers lock one job with `FOR UPDATE SKIP LOCKED`, check subject and absolute challenge deadline, and use at most 4 attempts with exponential 2/4/8-second backoff. Never renew expiry on delivery retry. Internal reason codes distinguish sink failure, expiry, revoked challenge and blocked subject. Enqueue/DB failure logs a safe event class and leaves no committed challenge/job; the client still receives generic status.

The local sink writes encrypted temporary content, then links a complete file atomically to its delivery ID. Duplicate acknowledgement retries require exactly equal encrypted bytes; a conflicting/truncated file fails rather than claiming delivery. A process crash before commit can retry the same durable job. Lost key, disk failure, expired job or FAILED job requires operator inspection; do not bypass authentication or extend an old token. New verified users can request a new challenge within the rate limit.

HTTP owner access and both WS paths gate against current user email/enrollment/blocked state. Lookup failures fail closed; revoked sessions close on measured revalidation, not immediately by assumption. Do not use the observed sample latency as a production SLA.

## Inputs required for phase 3B

- Owner selects a real mailbox/delivery channel or an independently reviewed local access-recovery procedure. No provider was selected/purchased here.
- Approve reset/verification lifetimes and rollout plan for existing users; 900s/24h are explicit rehearsal values only.
- Choose secret/outbox key custody, rotation/loss procedure, encrypted full-backup storage and restore target. JSON cannot recover Auth credentials.
- Select separate real-data database/role/volume/env/ports and ownership provenance. Never promote test users, FIXTURE or DEMO.
- Approve proxy/IP trust, rate policy, monitoring and delivery failure alerts under actual topology.

Planning-only env example is `docs/operations/phase3b-env.example.txt`. It deliberately keeps recovery off and contains no usable credentials. Do not activate or create real accounts automatically.
