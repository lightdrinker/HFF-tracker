import { fetchCachedAll, fetchCachedPage, preloadHffCache } from './hffCache'

preloadHffCache()

// Fetch a single page from the static cache for display.
export async function fetchPage(endpoint, page = 1, pageSize = 20, filterField, filterValue) {
  const cached = await fetchCachedPage(endpoint, page, pageSize, filterField, filterValue)
  if (cached) return cached

  return { items: [], totalCount: 0, cacheUnavailable: true }
}

// Fetch all matching rows from the static cache for export/filtering.
export async function fetchAllForExport(endpoint, onProgress, filterField, filterValue) {
  const cached = await fetchCachedAll(endpoint, onProgress, filterField, filterValue)
  return cached || []
}
