import { api } from './client.js'

export const restoreSession = (signal) => api('/api/v1/auth/me', { signal })
export const loginAccount = (username, password) => api('/api/v1/auth/login', { method: 'POST', body: { username, password } })
export const logoutAccount = () => api('/api/v1/auth/logout', { method: 'POST', body: {} })
export const changePasswordAccount = (currentPassword, nextPassword) => api('/api/v1/auth/change-password', { method: 'POST', body: { currentPassword, nextPassword } })
export const setupAdminAccount = (body) => api('/api/v1/auth/setup', { method: 'POST', body })
export const createUserAccount = (body) => api('/api/v1/users', { method: 'POST', body })
