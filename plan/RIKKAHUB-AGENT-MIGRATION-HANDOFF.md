# RikkaHub Agent migration handoff

Saved: 2026-07-17 04:31 +08:00
Checkpoint tag to restore from: `rikkahub-agent-migration-20260717-0431`
Repository: `SAINTTaiYi/decathlon-bike-daily-phase1`
Branch: `develop`

## Hard pause boundary

Step 16 is explicitly paused while the user migrates from the current RikkaHub app to `ExTV/rikkahub-agent`.

Until the user explicitly says to resume Step 16:

- do not configure any Secret;
- do not create an EdgeOne project;
- do not trigger Staging deployment;
- do not create Production resources;
- do not force-push or rewrite Git history.

## Accepted repository and release facts

- Accepted `main`: `e2a64ad4bbec313a23bcec254e12300377763bc8`.
- V5.3.0 release source: `89a60dd9d5db8432e22f865c86d89e915365dc3b`.
- V5.3.1 Staging database hardening patch: `eda86f8031aaa749009d0f7560bc719927353115`.
- Verified Supabase checkpoint: `766d20db6a952e51a594d504ae240cca86ab5db2`.
- `edgeone-staging` was created by ordinary push at `766d20db6a952e51a594d504ae240cca86ab5db2`; no force push.
- `staging` GitHub Environment ID: `18164650072`; deployment branch policy permits only `develop`.

## Supabase Staging state

- Organization: `SAINTTaiYi's Org` / `sctiyeyjvaezeofhysfq`.
- Project: `bike-ops-staging` / ref `xrxmayzwxabmzanwhkmo`.
- Region: Singapore / `ap-southeast-1`.
- Plan boundary: Free, confirmed 0 yuan/month; no usage billing or automatic upgrade approved.
- Status at last verification: `ACTIVE_HEALTHY`.
- PostgreSQL: `17.6.1.141`.
- Three checksum-locked repository migrations are applied.
- 15 `bike_ops` tables exist.
- Private Storage bucket `bike-ops-media`: non-public, 10 MB, JPEG/PNG/WebP.
- Migration history has RLS deny-all; anon/authenticated cannot read it.
- 14 foreign-key covering indexes exist.
- Security Advisor ERROR count: 0.
- Production has not been approved or created.

## Secret and manual-console state

No Secret value is stored in this repository, handoff, chat checkpoint, receipt, or artifact.

- Supabase database password was reset and is stored only in the user's password manager.
- A Session Pooler connection-string template was copied, but a complete URI has not been confirmed as stored.
- GitHub `staging` Environment Secret `MIGRATION_DATABASE_URL` is not confirmed configured.
- Supabase transaction-pooler runtime URL is not confirmed collected.
- Supabase server-only secret key is not confirmed collected.
- EdgeOne runtime application secrets have not been generated/configured.
- A mistaken unsaved Doppler entry was discarded; Doppler is not part of the architecture and must not be used.

## Exact recovery queue after explicit resume

1. In Supabase Connect, privately produce the complete Session Pooler URI on port 5432.
2. Configure GitHub `staging` Environment Secret `MIGRATION_DATABASE_URL` directly; never send its value through chat.
3. Privately collect the transaction-pooler URI on port 6543 and the Supabase server-only key.
4. Generate isolated Staging runtime secrets.
5. Create/configure the EdgeOne Makers Free project connected only to `edgeone-staging`.
6. Register the assigned HTTPS URL and run exact SHA/version/environment/database/Web verification.
7. Continue to Step 17 Staging acceptance only after Step 16 verification passes.

## Browser-control findings

- Official `browser-use/browser-harness` v0.1.5 is installed; telemetry is disabled.
- It cannot attach to the existing Android Chrome across the app sandbox.
- All temporary Browser Use Cloud browsers were stopped; no daemon remains; local Cloud OAuth was logged out and removed.
- `ExTV/rikkahub-agent` was reviewed at commit `b4dae335293c4a4a3f31fb17d0a3535c78b4accb`; latest reviewed release `v2.4.1-agent.2`.
- Its application ID is `excp.rikkahub`, so it can coexist with upstream RikkaHub.
- Its AI-controlled in-app WebView browser and optional global AccessibilityService screen tools were verified in source.
- Safest project mode: in-app browser only, minimum necessary browser write tools, `browser_eval_js` off, global Accessibility off, and manual login/MFA/Secret entry.
- No RikkaHub Agent APK was installed by this assistant.

## Skill-library state

- 384 archived Skill directories were permanently deleted at the user's request.
- 120 curated Skills remained, then official `browser-harness` was added; current active count is 121.
- Active catalog: `/workspace/SKILLS-CATALOG.md` in the old app workspace.
- Old installer/source/ZIP/report artifacts remain under `/workspace/skill-archive/2026-07-17-install-artifacts`.
- Frontend default five retained: `design-taste-frontend`, `impeccable`, `shadcn-ui`, `ui-ux-pro-max`, `design-md`.

## Safety invariants

- Free/no-card architecture remains mandatory.
- Staging and Production stay fully isolated.
- Production remains forbidden without separate approval.
- Secrets never enter chat, repository, logs, screenshots, or normal artifacts.
- External-platform network failures require stopping and enabling VPN, not blind retries.
- Deployment branches move only by ordinary fast-forward push.
