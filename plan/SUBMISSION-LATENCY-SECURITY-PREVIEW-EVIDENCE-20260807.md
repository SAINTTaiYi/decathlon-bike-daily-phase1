# Submission Latency + Security Hardening Preview Evidence

- Date: 2026-08-07 (+08:00)
- Scope: admin console readability, interactive write latency, login/tenant hardening; Preview only
- Public version: **V5.8.3 unchanged**
- Production target: `https://workshop.skin` — **not deployed or touched**
- Preview target: `https://bike-ops-preview.geeklightonefish.workers.dev`

## Merge identity

Three ordinary merges (no squash), in dependency order. Each merge SHA was confirmed twice:
once via `GET /pulls/:n` (`merged`, `merged_at`) and once via `git fetch` remote ref movement.

| PR | Title | Merge SHA | Merged at (UTC) |
| --- | --- | --- | --- |
| [#177](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/177) | admin directory/users readable at desktop widths | `3fd89f85db0847f4e17ae841094008f3235cce19` | 08:18:45Z |
| [#178](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/178) | cut fixed D1 round trips, stop blocking saves on bootstrap | `6380aeb5b3119435dd43cf694cde44438d78d617` | 08:22:06Z |
| [#179](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/179) | login backoff, failure alerting, tenant-scoped restore | `e3f15e08b45085476120c5316b82e38cc1eee2cd` | 08:29:47Z |

- Integration branch: `feature/cloudflare-workers-d1`
- Ref movement observed: `fee1b0e..3fd89f8`, `3fd89f8..6380aeb`, `6380aeb..e3f15e0`
- Final integration HEAD: `e3f15e08b45085476120c5316b82e38cc1eee2cd`

### Base retarget note

`#179` was opened against `perf/write-path-d1-roundtrips-20260807`. GitHub does **not** auto-retarget
when a base branch is merged (only when it is deleted), so the base was changed manually to the
integration branch before merging. `gh pr edit --base` fails with a Projects-classic GraphQL
deprecation error; `gh api --method PATCH repos/:owner/:repo/pulls/179 -f base=...` works.
After retarget the diff correctly narrowed to 2 commits / 7 files / +197 −22.

## CI evidence

CI runs on `ubuntu-latest` with a PostgreSQL 16 service. `conclusion` alone was **not** treated as
proof; each run was validated by log archive existence (`PK` magic), duration against a
pre-incident baseline, job step counts against `ci.yml`, and in-log test counts.

| PR | Run | verify | secrets | steps | tests (domain/db/web/api/worker) | failures |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (pre-incident) | [31092611800](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/31092611800) | 94s | 9s | 18 / 7 | 7 / 10 / 198 / 21 / 50 | 0 |
| #177 | [31160466002](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/31160466002) | 85s | 11s | 18 / 7 | 7 / 10 / 204 / 21 / 50 | 0 |
| #178 | [31159100469](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/31159100469) | 70s | 9s | 18 / 7 | 7 / 10 / 208 / 21 / 53 | 0 |
| #179 | [31159150109](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/31159150109) | 72s | 8s | 18 / 7 | 7 / 10 / 208 / 21 / 58 | 0 |

Test-count progression is internally consistent and rules out cache reuse or wrong-code runs:
web 198 → 204 (+6 admin-console) → 208 (+4 latency contracts); worker 50 → 53 (+3 round-trip
contracts) → 58 (+5 security contracts). Gitleaks full-history scan, typecheck, workflow policy
(88), web build, and the PostgreSQL migration runner were confirmed present in every log.

Each branch was cut from the previous branch's head, so every CI run executed the cumulative
code, not an isolated branch.

### Stuck run from the GitHub incident

Run `31125304368` (opened 2026-08-06T18:10:55Z during the Actions major outage) stayed
`status=queued` with `jobs: []` for over 13 hours. `gh run rerun` returned 403 "already running"
and `gh run cancel` returned 409 "re-run has not yet queued" — a contradictory state the API
cannot resolve. Closing and reopening PR #177 produced a fresh `pull_request` event and a new run
(`31160466002`) without changing the head SHA.

## Preview deployment

- Canonical workflow: `deploy-cloudflare-preview.yml` only
- Run: [31163535215](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/actions/runs/31163535215)
- Dispatched 2026-08-07T08:52:47Z, `workflow_dispatch`, head `e3f15e08b450`, conclusion `success`
- Inputs: `release_sha=e3f15e08b45085476120c5316b82e38cc1eee2cd`, all three confirmation flags true,
  `seed_preview_data=false` — existing Preview D1 acceptance data preserved
- D1 migration applied: `0010_admin_console_query_indexes.sql` ("About to apply 1 migration(s)")
- Upload: 277.57 KiB / gzip 61.85 KiB, 5 files uploaded (217 already present)
- Worker version ID: `7aff442f-92ae-4b9e-bcda-3353b74f678c`

## Online verification

Three cache-bypassing rounds (random query buster + `cache-control: no-store`), run locally and
independently of the deployment job's own self-check.

| Round | Preview | Production |
| --- | --- | --- |
| 1 | 5.8.3 / `e3f15e08b450` / env=preview | 5.8.3 / `3ec28a321b1f` / env=staging |
| 2 | 5.8.3 / `e3f15e08b450` / env=preview | 5.8.3 / `3ec28a321b1f` / env=staging |
| 3 | 5.8.3 / `e3f15e08b450` / env=preview | 5.8.3 / `3ec28a321b1f` / env=staging |

Production matches its pre-deployment baseline exactly and was never a deployment target.

## Latency measurement

Measured from a non-China sandbox, so absolute numbers do **not** represent end-user experience.
Server-side D1 cost was isolated as `p50(/health/ready) − p50(/health/live)`; `/health/live` loads
no secrets and issues no D1 query, `/health/ready` issues exactly one.

| Target | /health/live p50 | /health/ready p50 | one D1 round trip | colo |
| --- | --- | --- | --- | --- |
| Preview (pre-deploy, `fee1b0e`) | 98.5 ms | 157.1 ms | 58.6 ms | SIN |
| Production (`3ec28a3`) | 85.8 ms | 108.8 ms | 23.0 ms | SIN |

With the write path reduced to roughly 6 sequential round trips, D1 accounts for roughly
140–350 ms. Reported end-user submission latency is 2–4 s, so **D1 round trips are at most about
one tenth of perceived wait**. Further round-trip reduction has little headroom; the dominant
cost is the mainland-to-SIN/HKG international leg (RTT plus loss-driven retransmission) and the
fact that the submit button awaits the full server response.

## Two verification traps found

1. **`schemaVersion` is a hardcoded literal.** `apps/worker/src/routes/health.ts:30` returns
   `'0002_work_item_ticket_numbers'` unconditionally. It never changes and is **not** evidence of
   which migrations ran. Migration proof must come from the `wrangler d1 migrations apply` log.
2. **`cf-placement` response header is absent.** Smart Placement is present in `wrangler.jsonc`
   (`"placement": { "mode": "smart" }`, confirmed at the merged SHA) and its contract test passes,
   but runtime relocation is **not verified**. Cloudflare relocates only after a traffic-learning
   period and emits the header only once relocation occurs.

Additionally, the deployment job's own self-check observed a brief mixed-version window at
08:54:13Z: `/health/live` returned `e3f15e0` while `/health/ready` returned `fee1b0e`. Independent
verification minutes later converged on `e3f15e0` across three rounds.

## Production-side change (edge only, no deployment)

One Cloudflare change was applied to Production at the user's explicit request. It is edge
configuration and did not deploy or modify the Worker.

- Zone `workshop.skin` (`7b794ca61b9533d2d2b3511a16eaeb74`), ruleset `d199739ebbd348d6a9488a5d53c7b0da`
- Rule `b2aeef2e31b0416984c7036926ea838b`, action `block`
- Expression: `http.request.uri.path eq "/api/v1/auth/login" and http.request.method eq "POST"`
- 10 requests / 10 s, `mitigation_timeout` 10 s, characteristics `ip.src` + `cf.colo.id`
- Both `http_ratelimit` and `http_request_firewall_custom` phases had no entrypoint beforehand;
  nothing pre-existing was overwritten.

Free-plan constraints observed in practice, which differ from the published table: one rule per
zone; `block` is the only action (Log requires Pro+); `period` accepts only 10 (60 rejected);
`characteristics` must include `cf.colo.id`, so counting is per-colo rather than global — a
distributed attack's effective ceiling is therefore higher than 10 per 10 s.

Verified by API read-back only. No brute-force traffic was sent at Production. The rule is zone
bound, so it does not apply to Preview on `workers.dev`; that is expected.

## Coverage gap found, not yet fixed

`apps/worker/security/security-audit.test.ts` (42,800 bytes, 24 cases — the repository's most
security-focused suite) **has never run in CI**. The worker test script is
`node --import tsx --test test/*.test.ts`, which cannot match the `security/` directory. This
explains why three pre-existing failures in that suite never blocked a PR. Those three failures
were confirmed pre-existing by re-running the suite against the unmodified baseline. Wiring
the suite into CI requires fixing the stale assertions first, otherwise CI turns red immediately;
tracked as a separate task.

## Not covered

- CodeGraph pre/post analysis is exempt: CodeGraph runs on the Termux host, not in this sandbox.
- Preview source manifest fingerprint was not recorded this round.
- Smart Placement runtime relocation is unverified (see trap 2).
- Login rate limiting was not exercised with real traffic.
- No browser-based acceptance was performed; visual and interaction acceptance is the user's.
