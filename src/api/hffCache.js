const CACHE_URL = '/hff-cache.json'

let cache = null
let loadPromise = null
let status = {
  state: 'idle',
  meta: null,
  progress: null,
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

  emitStatus({ state: 'loading', meta: null, progress: null, error: null })

  loadPromise = (async () => {
    try {
      const res = await fetch(CACHE_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const manifestResult = await readJsonFile(res, ({ loadedBytes, totalBytes }) => {
        emitProgress({ loadedBytes, totalBytes })
      })
      const payload = manifestResult.payload
      if (!payload?.endpoints) throw new Error('Invalid cache payload')

      await loadChunkedEndpoints(payload, manifestResult.loadedBytes)

      cache = payload
      emitStatus({
        state: 'ready',
        meta: buildMeta(payload),
        progress: { percent: 100 },
        error: null,
      })
      return cache
    } catch (error) {
      console.warn('[hffCache] static cache unavailable:', error.message)
      emitStatus({ state: 'error', meta: null, progress: null, error: error.message })
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

function emitProgress(progress) {
  const percent = progress.totalBytes
    ? Math.min(99, Math.round((progress.loadedBytes / progress.totalBytes) * 100))
    : null

  emitStatus({
    state: 'loading',
    meta: null,
    progress: {
      ...progress,
      percent,
    },
    error: null,
  })
}

async function readJsonFile(res, onProgress) {
  const totalBytes = Number(res.headers.get('content-length') || 0)

  if (!res.body?.getReader) {
    const text = await res.text()
    const loadedBytes = new TextEncoder().encode(text).byteLength
    onProgress?.({ loadedBytes, totalBytes: totalBytes || loadedBytes })
    return { payload: JSON.parse(text), loadedBytes }
  }

  const reader = res.body.getReader()
  const chunks = []
  let loadedBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    loadedBytes += value.byteLength

    onProgress?.({ loadedBytes, totalBytes })
  }

  const bytes = new Uint8Array(loadedBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return {
    payload: JSON.parse(new TextDecoder('utf-8').decode(bytes)),
    loadedBytes,
  }
}

async function loadChunkedEndpoints(payload, manifestBytes) {
  const chunkedEntries = Object.entries(payload.endpoints || {})
    .filter(([, endpoint]) => Array.isArray(endpoint.chunks) && endpoint.chunks.length > 0)

  if (chunkedEntries.length === 0) return

  const totalBytes = manifestBytes + chunkedEntries.reduce((sum, [, endpoint]) =>
    sum + endpoint.chunks.reduce((chunkSum, chunk) => chunkSum + (chunk.bytes || 0), 0),
  0)
  let loadedBytes = manifestBytes

  for (const [, endpoint] of chunkedEntries) {
    const items = []

    for (const chunk of endpoint.chunks) {
      const res = await fetch(chunk.url)
      if (!res.ok) throw new Error(`HTTP ${res.status} loading ${chunk.url}`)

      const chunkResult = await readJsonFile(res, ({ loadedBytes: chunkLoadedBytes }) => {
        emitProgress({
          loadedBytes: loadedBytes + chunkLoadedBytes,
          totalBytes,
        })
      })

      items.push(...(chunkResult.payload.items || []))
      loadedBytes += chunkResult.loadedBytes
      emitProgress({ loadedBytes, totalBytes })
    }

    endpoint.items = items
  }
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
