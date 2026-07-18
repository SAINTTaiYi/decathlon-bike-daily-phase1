const ITEM_SPLIT = /(?:\r?\n|\s*[+＋;；、|｜]\s*)+/u

function fallbackTicketNumber(id = '') {
  let hash = 2166136261
  for (const char of String(id)) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (Math.abs(hash >>> 0) % 999999) + 1
}

export function formatTicketNumber(ticketNo, id) {
  const numeric = Number(ticketNo)
  const value = Number.isInteger(numeric) && numeric > 0 ? numeric : fallbackTicketNumber(id)
  return `#${String(value).padStart(6, '0')}`
}

export function splitMaintenanceItems(value) {
  const source = String(value || '').trim()
  if (!source) return []
  const items = source
    .split(ITEM_SPLIT)
    .map((item) => item.replace(/^[•·\-–—]\s*/u, '').trim())
    .filter(Boolean)
  return items.length ? items : [source]
}

export function joinMaintenanceLine(value, maxItems = 3) {
  const items = splitMaintenanceItems(value)
  if (!items.length) return ''
  if (items.length <= maxItems) return items.join('｜')
  return `${items.slice(0, maxItems).join('｜')}……`
}

export function maskContactValue(value = '') {
  const source = String(value ?? '').trim()
  if (!source) return ''
  const digits = source.replace(/\D/gu, '')
  if (digits.length >= 7) return `${digits.slice(0, 3)}****${digits.slice(-4)}`
  if (source.length <= 4) return source
  return `${source.slice(0, 2)}****${source.slice(-2)}`
}

export function formatScanDate(value = '') {
  const source = String(value ?? '').trim()
  if (!source) return ''
  const match = source.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/u)
  if (match) return `${match[2].padStart(2, '0')}.${match[3].padStart(2, '0')}`
  const short = source.match(/(\d{1,2})[-/.](\d{1,2})/u)
  if (short) return `${short[1].padStart(2, '0')}.${short[2].padStart(2, '0')}`
  return source
}

export function formatDetailDate(value = '') {
  const source = String(value ?? '').trim()
  if (!source) return ''
  const match = source.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/u)
  if (match) return `${match[1]}.${match[2].padStart(2, '0')}.${match[3].padStart(2, '0')}`
  return source.replaceAll('-', '.')
}

export function serviceSectionLabel(record) {
  if (record?.scene === 'repair' || record?.repairProject || record?.pickupSource === 'repair') return 'Maintenance'
  if (record?.pickupSource === 'self-pickup') return 'Order'
  if (record?.pickupSource === 'customer-storage') return 'Storage note'
  return 'Details'
}
