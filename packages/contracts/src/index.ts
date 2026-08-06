import { z } from 'zod'

export const appRoles = ['operator', 'manager', 'admin'] as const
export const workItemKinds = ['pickup', 'handover', 'repair', 'resale'] as const
export const pickupSources = ['self-pickup', 'repair', 'customer-storage', 'used-car'] as const
export const selfPickupPlatforms = ['tmall', 'jd', 'mini-program'] as const
export const notificationStatuses = ['pending', 'notified'] as const
export const repairTypes = ['质保', '付费', '免费', '门店产品维修'] as const
export const repairStatuses = [
  '维修中', '等待配件',
  '已开付款单', '已开维修单', '已开质保维修单', '已开质保付款单-请过机', '快速服务免费',
  '维修完成-已开付款单', '维修完成-已开维修单', '维修完成-已开质保维修单',
  '维修完成-已开质保付款单-请过机', '维修完成-快速服务免费'
] as const
export const contactTypes = ['phone', 'member'] as const

export const usernameSchema = z.string().transform((value) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ')).pipe(z.string().min(1).max(24))
export const passwordSchema = z.string().min(10).max(128)
export const uuidSchema = z.string().uuid()
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)
export const revisionSchema = z.number().int().positive()

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128)
}).strict()

export const setupAdminSchema = z.object({
  token: z.string().min(32).max(512),
  username: usernameSchema,
  password: passwordSchema,
  displayName: usernameSchema,
  storeCode: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/u),
  storeName: z.string().trim().min(1).max(120)
}).strict()

export const createUserSchema = z.object({
  username: usernameSchema,
  displayName: usernameSchema.optional(),
  password: passwordSchema,
  role: z.enum(appRoles).default('operator')
}).strict()

export const adminCreateUserSchema = z.object({
  username: usernameSchema,
  displayName: usernameSchema,
  storeId: uuidSchema,
  role: z.enum(appRoles),
  password: passwordSchema
}).strict()

export const adminUserStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
  expectedStatus: z.enum(['active', 'disabled']),
  expectedUpdatedAt: z.string().datetime()
}).strict()

export const adminPasswordResetSchema = z.object({
  expectedUpdatedAt: z.string().datetime()
}).strict()

export const adminStoreDecisionSchema = z.object({
  approve: z.boolean(),
  reason: z.string().trim().max(500).optional(),
  expectedUpdatedAt: z.string().datetime()
}).strict().superRefine((value, context) => {
  if (!value.approve && (!value.reason || value.reason.length < 2)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: '拒绝门店时必须填写至少 2 个字符的理由。' })
  }
})


const corporateEmailSchema = z.string().trim().toLowerCase().email().max(320).refine(
  (value) => value.endsWith('@decathlon.com'),
  '仅支持 @decathlon.com 邮箱。'
)
export const directoryStatusSchema = z.enum(['active', 'disabled'])
export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/u)
export const registrationOtpSchema = z.object({
  username: usernameSchema,
  displayName: usernameSchema.optional(),
  email: corporateEmailSchema,
  storeId: uuidSchema
}).strict()
export const registrationVerifyOtpSchema = z.object({
  challengeId: uuidSchema,
  otp: otpCodeSchema
}).strict()
export const registrationCompleteSchema = z.object({
  challengeId: uuidSchema,
  completionToken: z.string().min(32).max(512),
  password: passwordSchema
}).strict()
export const platformAdminSetupSchema = z.object({
  token: z.string().min(32).max(512),
  password: passwordSchema,
  storeId: uuidSchema
}).strict()
export const roleChangeRequestSchema = z.object({
  userId: uuidSchema.optional(),
  targetRole: z.enum(['manager', 'admin']),
  reason: z.string().trim().min(2).max(500)
}).strict()
export const decisionSchema = z.object({
  approve: z.boolean(),
  reason: z.string().trim().min(2).max(500),
  expectedRevision: revisionSchema
}).strict()
export const storeTransferRequestSchema = z.object({
  targetStoreId: uuidSchema,
  reason: z.string().trim().min(2).max(500)
}).strict()
export const directoryEntitySchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: uuidSchema.optional(),
  code: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/u).optional(),
  status: directoryStatusSchema.optional()
}).strict()

export const kpiSchema = z.object({
  salesVehicles: z.coerce.number().int().min(0).max(9999),
  safetyChecks: z.coerce.number().int().min(0).max(9999),
  safetyModel: z.string().trim().max(120).default(''),
  validReviews: z.coerce.number().int().min(0).max(9999),
  usedSold: z.coerce.number().int().min(0).max(9999),
  usedReceived: z.coerce.number().int().min(0).max(9999),
  expectedRevision: z.number().int().nonnegative().optional()
}).strict()

const genericWorkItem = z.object({
  title: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(500),
  meta: z.string().trim().max(240).default(''),
  status: z.string().trim().min(1).max(80)
})

export const repairInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  contactType: z.enum(contactTypes),
  contactValue: z.string().trim().min(1).max(80),
  repairType: z.enum(repairTypes),
  repairProject: z.string().trim().min(1).max(500),
  pickupDate: z.string().max(10).default(''),
  status: z.enum(repairStatuses)
}).strict()

export const pickupInputSchema = z.object({
  pickupSource: z.enum(['self-pickup', 'customer-storage', 'used-car']),
  selfPickupPlatform: z.enum(selfPickupPlatforms).or(z.literal('')).default(''),
  title: z.string().trim().min(1).max(120),
  detail: z.string().trim().max(500).default(''),
  // Optional contact. Prefer contactType/contactValue; meta remains for storage/compat.
  meta: z.string().trim().max(80).default(''),
  contactType: z.enum(contactTypes).default('phone'),
  contactValue: z.string().trim().max(80).default(''),
  status: z.string().trim().min(1).max(80)
}).strict()

export const workItemCreateSchema = z.discriminatedUnion('scene', [
  z.object({ scene: z.literal('repair'), values: repairInputSchema }),
  z.object({ scene: z.literal('pickup'), values: pickupInputSchema }),
  z.object({ scene: z.literal('poster'), values: genericWorkItem.strict() }),
  z.object({ scene: z.literal('resale'), values: genericWorkItem.strict() })
])

export const workItemUpdateSchema = z.object({
  expectedRevision: revisionSchema,
  values: z.union([repairInputSchema, pickupInputSchema, genericWorkItem.strict()])
}).strict()

export const actionSchema = z.object({ expectedRevision: revisionSchema }).strict()
export const notificationSchema = actionSchema.extend({ notificationStatus: z.enum(notificationStatuses) }).strict()
export const pickupCompleteSchema = actionSchema.extend({ pickupCode: z.string().trim().max(120).default('') }).strict()

export const localV5ImportSchema = z.object({
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  ledger: z.unknown(),
  days: z.array(z.unknown()).max(400),
  confirmed: z.literal(true)
}).strict()

export const attachmentPrepareSchema = z.object({
  workItemId: uuidSchema,
  fileName: z.string().trim().min(1).max(160),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict()

export const attachmentCompleteSchema = z.object({
  attachmentId: uuidSchema,
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000)
}).strict()

export type AppRole = typeof appRoles[number]
export type LoginInput = z.infer<typeof loginSchema>
export type KpiInput = z.infer<typeof kpiSchema>
export type WorkItemCreateInput = z.infer<typeof workItemCreateSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type RegistrationOtpInput = z.infer<typeof registrationOtpSchema>
export type RegistrationCompleteInput = z.infer<typeof registrationCompleteSchema>

export const adminStoreMemberUpdateSchema = z.object({ displayName: z.string().trim().min(1).max(24).optional(), role: z.enum(['operator', 'manager', 'admin']).optional(), expectedUpdatedAt: z.string().min(1).max(80) }).strict().refine((value) => Boolean(value.displayName || value.role), { message: '至少提供一个成员字段。' })
export const adminStoreMemberRemoveSchema = z.object({ expectedUpdatedAt: z.string().min(1).max(80) }).strict()
