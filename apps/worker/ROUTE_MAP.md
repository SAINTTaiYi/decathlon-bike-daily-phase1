# Worker route map (Phase B)

## Health
- GET `/health/live`
- GET `/health/ready`
- GET `/api/v1/meta/version`

## Auth
- POST `/api/v1/auth/setup`
- POST `/api/v1/auth/login`
- GET `/api/v1/auth/me`
- POST `/api/v1/auth/logout`
- POST `/api/v1/auth/change-password`

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
