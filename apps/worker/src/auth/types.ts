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
  // 邮箱绑定引导状态（loadSession 从 users 表实时派生；审计用人工构造的
  // context 可以不填，undefined 视为"不拦截"）。
  emailBound?: boolean
  emailBindingExempt?: boolean
  sessionTokenHash: string
  csrfHash: string
}
