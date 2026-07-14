export const USER_SESSION_KEY = 'decathlon-bike-current-user'
export const USERNAME_MAX_LENGTH = 24

export function normalizeLoginUsername(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/gu, ' ')
    .slice(0, USERNAME_MAX_LENGTH)
}

export function resolveAuditActor(value, fallback = '历史记录') {
  return normalizeLoginUsername(value) || fallback
}
