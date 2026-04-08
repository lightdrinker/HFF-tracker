const PAGE_SIZE = 100

export async function fetchAll(endpoint) {
  let allItems = []
  let startIdx = 1
  let totalCount = null

  while (true) {
    const endIdx = startIdx + PAGE_SIZE - 1
    const url = `/api/proxy?endpoint=${endpoint}&startIdx=${startIdx}&endIdx=${endIdx}`
    const res = await fetch(url)
    const data = await res.json()

    if (!data || !data.row) break

    if (totalCount === null) totalCount = parseInt(data.total_count)
    allItems = [...allItems, ...data.row]
    if (allItems.length >= totalCount) break
    startIdx += PAGE_SIZE
  }

  return allItems
}
