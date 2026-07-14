export const REPAIR_TYPES: string[]
export const REPAIR_STATUSES: string[]
export const REPAIR_PICKUP_READY_STATUSES: string[]
export const FREE_REPAIR: string
export const STORE_PRODUCT_REPAIR: string
export const SELF_PICKUP_PLATFORMS: string[]

export interface NormalizedRepairFields {
  title: string
  contactType: string
  contactValue: string
  repairType: string
  repairProject: string
  pickupDate: string
  status: string
}

export interface NormalizedPickupFields {
  pickupSource: string
  selfPickupPlatform: string
  title: string
  detail: string
  meta: string
  status: string
}

export interface PickupCompletionRecord {
  pickupSource?: string
  repairType?: string
  status?: string
}

export function normalizeUsername(value: unknown): string
export function usernameKey(value: unknown): string
export function validDate(value: string): boolean
export function normalizeRepair(values: object): { ok: false; error: string } | { ok: true; fields: NormalizedRepairFields }
export function repairCompletionRoute(record: { repairType?: unknown }): { ok: false; error: string } | { ok: true; route: 'completed' | 'pickup' }
export function validatePickup(values: object): { ok: false; error: string } | { ok: true; fields: NormalizedPickupFields }
export function validatePickupCompletion(record: PickupCompletionRecord, suppliedCode?: string): { ok: boolean; error?: string }
export function localBusinessDate(timeZone?: string, now?: Date): string
export function describeChanges(before: Record<string, unknown>, after: Record<string, unknown>, labels?: Record<string, string>): string[]
