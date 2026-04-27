import { mergeRows, preload as preloadI0030 } from './i0030Store'

const PAGE_SIZE = 100

function buildUrl(endpoint, startIdx, endIdx, filterField, filterValue) {
  let url = `/api/proxy?endpoint=${endpoint}&startIdx=${startIdx}&endIdx=${endIdx}`
  if (filterField && filterValue) {
    url += `&filterField=${filterField}&filterValue=${encodeURIComponent(filterValue)}`
  }
  return url
}

// Extract endpoint data from response (handles both Vercel proxy and direct API)
function extractData(data, endpoint) {
  if (data && data.row) return data
  if (data && data[endpoint]) return data[endpoint]
  return null
}

// C003 결과에 I0030 필드 보강 필요한지 (다른 endpoint는 그대로 통과)
const NEEDS_I0030_MERGE = ['C003']

// 앱 시작 시 미리 로드
preloadI0030()

// Fetch a single page for display (server-side pagination)
export async function fetchPage(endpoint, page = 1, pageSize = 20, filterField, filterValue) {
  const startIdx = (page - 1) * pageSize + 1
  const endIdx = startIdx + pageSize - 1
  const url = buildUrl(endpoint, startIdx, endIdx, filterField, filterValue)
  const res = await fetch(url)
  const raw = await res.json()
  const data = extractData(raw, endpoint)

  if (!data || !data.row) return { items: [], totalCount: 0 }

  let items = data.row
  if (NEEDS_I0030_MERGE.includes(endpoint)) {
    items = await mergeRows(items)
  }

  return {
    items,
    totalCount: parseInt(data.total_count) || 0,
  }
}

// Fetch ALL data for excel export (with progress callback)
export async function fetchAllForExport(endpoint, onProgress, filterField, filterValue) {
  let allItems = []
  let startIdx = 1
  let totalCount = null

  while (true) {
    const endIdx = startIdx + PAGE_SIZE - 1
    const url = buildUrl(endpoint, startIdx, endIdx, filterField, filterValue)
    const res = await fetch(url)
    const raw = await res.json()
    const data = extractData(raw, endpoint)

    if (!data || !data.row) break

    if (totalCount === null) totalCount = parseInt(data.total_count)
    allItems = [...allItems, ...data.row]

    if (onProgress) onProgress(allItems.length, totalCount)
    if (allItems.length >= totalCount) break
    startIdx += PAGE_SIZE
  }

  if (NEEDS_I0030_MERGE.includes(endpoint)) {
    allItems = await mergeRows(allItems)
  }

  return allItems
}
