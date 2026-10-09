# Independent repository and public-service review - 2026-10-09

## Conclusion

The existing public real-use release is online, with general email/password registration enabled, for the owner's school-project and small initial audience scope. The repository additionally contains a completed local notebook redesign awaiting visual review and release. The public service still serves the earlier presentation; the redesign has not been deployed.

This review found no new blocking failure in the tests/builds or the inspected presentation changes. It is not a comprehensive security certification or a new end-to-end cloud account acceptance test.

## Independently checked public behavior

Origin: https://finntech-personal.onrender.com/

- `/`: HTTP 200, tracker HTML served.
- `/api/health`: HTTP 200, database `ok`, real `registrationsOpen=true`, `authenticationMode=email-password`, `stagingEnrollment=false`, `rehearsal=false`. Health explicitly reports auth `not_checked`; it does not itself prove account creation or password login.
- `/api/ready`: HTTP 200, `ready=true`.
- `/api/auth-capabilities`: recovery and verification both false.
- Anonymous `/api/me` and `/api/finance`: HTTP 401, `AUTH_REQUIRED`.
- Anonymous `/api/auth/get-session`: HTTP 200 with `null`.
- Live HTML references `index-BwAi6aCJ.js` and `index-gusGXyWs.css`; current local tracker build references `index-BKuNt6Vf.js` and `index-DR_i4bUo.css`. Live CSS contains the old `#f4f0e8` canvas and does not contain the new `notebook-auth-art` selector. This independently confirms the local redesign is not the currently served version.

Two initial exploratory requests used nonexistent `/api/account` and `/api/finance/overview` paths and received expected route-not-found 404s. These are not counted as application failures; the source-defined protected paths above were checked afterward.

No accounts were created, no login credentials were used and no financial/cloud data was modified. The prior student release's registration, owner isolation, JSON export and post-redeployment persistence results were read as existing evidence, not rerun or represented as new independent cloud tests.

## Current source and design

Reviewed the notebook incremental presentation changes and current CSS/components. The changes add original local SVG artwork, pastel paper tokens, a labeled desktop sidebar, responsive mobile layouts, matching dark styling and presentation adjustments for auth, history, backup, account and dialogs. Business handlers and original navigation guards remain in the inspected patch.

All 94 changed-file entries match their recorded after-SHA256 hashes. All 81 files found under API/shared packages in the notebook starting snapshot are byte-identical to current files. The root and web package manifests are also unchanged by the redesign, as indicated by patch scope. Reverse patch applicability and tracked diff whitespace checks pass.

Inspected existing final desktop-light and mobile-dark finance screenshots. Browser matrix, keyboard, contrast, pending retry and other screenshot results remain evidence produced by the implementation task; this review did not rerun that full browser matrix. The reported synthetic preview is not currently listening on port 4308 and was not restarted.

The main checkout remains substantially modified/untracked relative to its old legacy Git HEAD. This is consistent with the existing isolated release workflow, but local source should not be confused with already published GitHub or Render code. No staging, commit or push was performed here.

## Checks rerun for this review

| Command | Result | Exit |
| --- | --- | --- |
| `npm test` | 49 files, 408 tests passed | 0 |
| `npm run build` | legacy root build passed | 0 |
| `npm run tracker:test` | finance 21 + contracts 13 + API 125 + web 104 = 263 passed; Vite dev smoke passed and its port released | 0 |
| `npm run tracker:typecheck` | passed | 0 |
| `npm run tracker:build` | API/shared/web builds passed | 0 |
| `node --no-strip-types scripts/tracker-package-smoke.mjs` | compiled imports, Decimal and accounting checks passed | 0 |
| `git diff --check` | passed | 0 |
| notebook incremental patch reverse check | passed | 0 |
| `npm audit --json` | 14 findings: 12 high, 2 moderate, 0 critical | 1 |

Fresh logs are in `tmp/repo-review-20261009/`. Host execution was used for commands known to encounter Windows sandbox realpath restrictions. No source assertion, dependency, schema, auth setting or runtime policy was changed to make checks pass. Existing build/typecheck scripts generated their normal local build/client outputs.

The 14 flagged package names are absent from the stored 119-package student-release server runtime inventory. This comparison does not regenerate a cloud-image inventory or establish that build tools, compiled browser code or the operating system are vulnerability-free. Findings remain follow-up work; their severity alone should not be confused with 12 independently demonstrated live exploitable defects.

## Remaining work and limits

1. Review the local notebook design visually, then publish its allowlisted tracker changes through the existing real-use release workflow and verify the public build. This review does not authorize or perform deployment.
2. Keep the lack of verification/password recovery explicit. The current supported mode has real password accounts but no reset email; users must retain passwords and private exports.
3. Track the dependency findings and resolve applicable packages through a separately tested change.
4. Free-host sleep/quota limits and the absence of configured automated external backup remain accepted operating limitations. User JSON export is not a full database or login recovery backup.

Real signup/login, new PostgreSQL integration, current cloud financial writes/restore, session expiration/WS revocation, configured external provider/mail, hardware touch/safe-area and off-device disaster recovery were not newly tested in this review. None are falsely marked passed. No commit, push, deployment, cloud-setting change, database migration, data deletion, paid purchase or application-source fix was performed.
