const ITEM_SPLIT = /(?:\r?\n|\s*[+＋;；、]\s*)+/u

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

export function serviceSectionLabel(record) {
  if (record?.scene === 'repair' || record?.repairProject || record?.pickupSource === 'repair') return 'Maintenance'
  if (record?.pickupSource === 'self-pickup') return 'Order'
  if (record?.pickupSource === 'customer-storage') return 'Storage note'
  return 'Details'
}
