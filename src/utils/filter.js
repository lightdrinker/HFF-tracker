export function isNew(dateStr) {
  if (!dateStr) return false
  const d = dateStr.replace(/\D/g, '')
  if (d.length < 8) return false
  const date = new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`)
  const diff = (Date.now() - date) / (1000 * 60 * 60 * 24)
  return diff <= 30
}

export function filterByPeriod(items, dateField, period) {
  if (!period || period === 'all' || !dateField) return items
  const days = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 }[period]
  if (!days) return items
  return items.filter(item => {
    const d = (item[dateField] || '').replace(/\D/g, '')
    if (d.length < 8) return false
    const date = new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`)
    return (Date.now() - date) / (1000 * 60 * 60 * 24) <= days
  })
}

export function filterBySearch(items, keyword, searchFields) {
  if (!keyword.trim()) return items
  const kw = keyword.trim().toLowerCase()
  return items.filter(item =>
    searchFields.some(f => (item[f] || '').toLowerCase().includes(kw))
  )
}