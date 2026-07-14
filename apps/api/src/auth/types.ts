import type { AppRole } from '@bike-ops/contracts'

export interface AuthContext {
  sessionTokenHash: string
  userId: string
  displayName: string
  storeId: string
  storeCode: string
  storeName: string
  storeTimezone: string
  role: AppRole
  csrfHash: string
  mustChangePassword: boolean
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
  }
}
