export function selectedBatchTargets(items, selectedIds, allCurrentPage = false) {
  if (allCurrentPage) return [...items]
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds)
  return items.filter((item) => selected.has(item.id))
}

export function appendUniqueById(current, incoming) {
  const byId = new Map((current || []).map((item) => [item.id, item]))
  for (const item of incoming || []) byId.set(item.id, item)
  return [...byId.values()]
}

export function requestGate() {
  let sequence = 0
  let controller = null
  return {
    next() {
      controller?.abort()
      controller = new AbortController()
      sequence += 1
      return { id: sequence, signal: controller.signal }
    },
    isLatest(id) { return id === sequence },
    cancel() {
      controller?.abort()
      controller = null
      sequence += 1
    }
  }
}
