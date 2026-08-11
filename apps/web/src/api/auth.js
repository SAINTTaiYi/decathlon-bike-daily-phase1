import { api } from './client.js'

export const restoreSession = (signal) => api('/api/v1/auth/me', { signal })
export const loginAccount = (username, password) => api('/api/v1/auth/login', { method: 'POST', body: { username, password } })
export const logoutAccount = () => api('/api/v1/auth/logout', { method: 'POST', body: {} })
export const changePasswordAccount = (currentPassword, nextPassword, idempotencyKey) => api('/api/v1/auth/change-password', { method: 'POST', body: { currentPassword, nextPassword }, idempotencyKey })
export const setupAdminAccount = (body) => api('/api/v1/auth/setup', { method: 'POST', body })
export const createUserAccount = (body) => api('/api/v1/users', { method: 'POST', body })

export const getRegistrationDirectory = () => api('/api/v1/registration/directory')
export const requestRegistrationOtp = (body) => api('/api/v1/registration/otp', { method: 'POST', body })
export const verifyRegistrationOtp = (body) => api('/api/v1/registration/verify-otp', { method: 'POST', body })
export const completeRegistration = (body) => api('/api/v1/registration/complete', { method: 'POST', body })
export const setupPlatformAdmin = (body) => api('/api/v1/registration/platform-admin', { method: 'POST', body })

export const getGovernanceOverview = () => api('/api/v1/governance/overview')
export const createRoleChangeRequest = (body) => api('/api/v1/governance/role-requests', { method: 'POST', body })
export const decideRoleChangeRequest = (id, body) => api(`/api/v1/governance/role-requests/${id}/decision`, { method: 'POST', body })
export const createTransferRequest = (body) => api('/api/v1/governance/transfer-requests', { method: 'POST', body })
export const decideTransferRequest = (id, body) => api(`/api/v1/governance/transfer-requests/${id}/decision`, { method: 'POST', body })
export const createDirectoryEntry = (kind, body) => api(`/api/v1/governance/directory/${kind}`, { method: 'POST', body })
export const updateDirectoryEntry = (kind, id, body) => api(`/api/v1/governance/directory/${kind}/${id}`, { method: 'PATCH', body })
