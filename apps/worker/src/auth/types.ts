export interface AuthContext {
  userId: string
  displayName: string
  mustChangePassword: boolean
  storeId: string
  storeCode: string
  storeName: string
  storeTimezone: string
  role: 'operator' | 'manager' | 'admin'
  isPlatformAdmin: boolean
  sessionTokenHash: string
  csrfHash: string
}
