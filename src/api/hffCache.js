const CACHE_URL = '/hff-cache.json'

let cache = null
let loadPromise = null
let status = {
  state: 'idle',
  meta: null,
  error: null,
}

const listeners = new Set()

function emitStatus(nextStatus) {
  status = nextStatus
  for (const listener of listeners) {
    listener(status)
  }
}

function buildMeta(payload) {
  const endpoints = Object.fromEntries(
    Object.entries(payload.endpoints || {}).map(([endpoint, data]) => [
      endpoint,
      {
        totalCount: data.totalCount || 0,
        itemCount: data.itemCount || data.items?.length || 0,
      },
    ]),
  )

  return {
    generatedAt: payload.generatedAt,
    schemaVersion: payload.schemaVersion,
    endpoints,
  }
}

export function getCacheStatus() {
  return status
}

export function subscribeCacheStatus(listener) {
  listeners.add(listener)
  listener(status)
  return () => listeners.delete(listener)
}

export async function loadHffCache() {
  if (cache) return cache
  if (loadPromise) return loadPromise

  emitStatus({ state: 'loading', meta: null, error: null })

  loadPromise = (async () => {
    try {
      const res = await fetch(CACHE_URL, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const payload = await res.json()
      if (!payload?.endpoints) throw new Error('Invalid cache payload')

      cache = payload
      emitStatus({ state: 'ready', meta: buildMeta(payload), error: null })
      return cache
    } catch (error) {
      console.warn('[hffCache] static cache unavailable:', error.message)
      emitStatus({ state: 'error', meta: null, error: error.message })
      return null
    }
  })()

  return loadPromise
}

export function preloadHffCache() {
  return loadHffCache()
}

function endpointItems(payload, endpoint) {
  const items = payload?.endpoints?.[endpoint]?.items
  return Array.isArray(items) ? items : null
}

function includesValue(value, query) {
  return String(value ?? '').toLowerCase().includes(query)
}

function filterRows(rows, filterField, filterValue) {
  const query = String(filterValue || '').trim().toLowerCase()
  if (!query) return rows

  if (filterField) {
    return rows.filter((row) => includesValue(row[filterField], query))
  }

  return rows.filter((row) =>
    Object.values(row).some((value) => includesValue(value, query)),
  )
}

export async function fetchCachedPage(endpoint, page = 1, pageSize = 20, filterField, filterValue) {
  const payload = await loadHffCache()
  const rows = endpointItems(payload, endpoint)
  if (!rows) return null

  const filtered = filterRows(rows, filterField, filterValue)
  const start = (page - 1) * pageSize

  return {
    items: filtered.slice(start, start + pageSize),
    totalCount: filtered.length,
    fromCache: true,
    cacheMeta: getCacheStatus().meta,
  }
}

export async function fetchCachedAll(endpoint, onProgress, filterField, filterValue) {
  const payload = await loadHffCache()
  const rows = endpointItems(payload, endpoint)
  if (!rows) return null

  const filtered = filterRows(rows, filterField, filterValue)
  if (onProgress) onProgress(filtered.length, filtered.length)
  return filtered
}
