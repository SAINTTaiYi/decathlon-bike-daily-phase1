# Worker route map (Phase B)

## Health
- GET `/health/live`
- GET `/health/ready`
- GET `/api/v1/meta/version`

## Auth
- POST `/api/v1/auth/setup` → 410 legacy setup disabled
- POST `/api/v1/auth/login`
- GET `/api/v1/auth/me`
- POST `/api/v1/auth/logout`
- POST `/api/v1/auth/change-password`


## Registration
- GET `/api/v1/registration/directory` (active directory only)
- POST `/api/v1/registration/otp`
- POST `/api/v1/registration/verify-otp`
- POST `/api/v1/registration/complete`
- POST `/api/v1/registration/platform-admin` (one-time CHU13 bootstrap)

## Governance
- GET `/api/v1/governance/overview`
- POST `/api/v1/governance/role-requests`
- POST `/api/v1/governance/role-requests/:id/decision` (CHU13 only)
- POST `/api/v1/governance/transfer-requests`
- POST `/api/v1/governance/transfer-requests/:id/decision` (target-store admin only)
- POST `/api/v1/governance/directory/:kind` (CHU13 only)
- PATCH `/api/v1/governance/directory/:kind/:id` (CHU13 only)

## Closing
- GET `/api/v1/daily-closing/current`
- PUT `/api/v1/daily-closing/current/sales`
- DELETE `/api/v1/daily-closing/current/sales`
- POST `/api/v1/daily-closing/current/close` (manager/admin)
- POST `/api/v1/daily-closing/current/reopen` (manager/admin)

## Work items
- GET `/api/v1/work-items`
- POST `/api/v1/work-items`
- PATCH `/api/v1/work-items/:id`
- POST `/api/v1/work-items/:id/list-resale`
- POST `/api/v1/work-items/:id/sell-resale`
- POST `/api/v1/work-items/:id/complete-repair`
- POST `/api/v1/work-items/:id/complete-handover`
- POST `/api/v1/work-items/:id/notification`
- POST `/api/v1/work-items/:id/pick-up`
- DELETE `/api/v1/work-items/:id`

## Audit
- GET `/api/v1/audit-events`
- POST `/api/v1/audit-events/:id/undo`

## Bootstrap
- GET `/api/v1/bootstrap`

## Disabled
- ALL `/api/v1/attachments/*` → 410 MEDIA_DISABLED

## Deferred
- Legacy local V5 import (`/api/v1/migrations/*`)

## Shiphub integration (v1.3, feature-gated)

- GET `/api/v1/settings/shiphub`
- POST `/api/v1/settings/shiphub/connect/start`
- GET `/api/v1/settings/shiphub/callback`
- POST `/api/v1/settings/shiphub/disconnect`
- GET `/api/v1/shiphub/summary`
- GET `/api/v1/shiphub/orders?category=&cursor=`
- GET `/api/v1/shiphub/orders/:category/:id`
- POST `/api/v1/shiphub/orders/:category/:id/actions`
- POST `/api/v1/shiphub/sync`

All Shiphub routes reuse the existing session, store selection, password-change gate, CSRF and idempotency controls. Preview remains disabled and fixture/live access is independently guarded.
