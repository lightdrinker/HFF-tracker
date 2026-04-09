import { useState, useEffect, useMemo, useCallback } from 'react'
import { fetchPage, fetchAllForExport } from '../api/fetchAll'
import { filterByPeriod, filterBySearch, isNew } from '../utils/filter'
import { exportToExcel } from '../utils/excel'

const PAGE_SIZE = 20

const PERIOD_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: '1m', label: '1개월' },
  { value: '3m', label: '3개월' },
  { value: '6m', label: '6개월' },
  { value: '1y', label: '1년' },
]

export default function TabView({ tab }) {
  const isServerFilter = tab.useServerFilter

  // Active columns: which columns are "확정" (selected for display/export)
  const [activeKeys, setActiveKeys] = useState(() =>
    tab.columns.filter(c => c.defaultOn).map(c => c.key)
  )

  // Server-filtered tabs: paginated display
  const [pageData, setPageData] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Server filter state
  const [serverFilterField, setServerFilterField] = useState(
    tab.serverFilterFields?.[0]?.key || ''
  )
  const [serverFilterValue, setServerFilterValue] = useState('')
  const [appliedFilter, setAppliedFilter] = useState({ field: '', value: '' })

  // Small-data tabs: all data loaded at once
  const [allData, setAllData] = useState([])
  const [allLoaded, setAllLoaded] = useState(false)

  // Common
  const [localSearch, setLocalSearch] = useState('')
  const [period, setPeriod] = useState('all')

  // Excel export
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 })

  // Reset on tab change
  useEffect(() => {
    setActiveKeys(tab.columns.filter(c => c.defaultOn).map(c => c.key))
    setPageData([])
    setAllData([])
    setAllLoaded(false)
    setTotalCount(0)
    setPage(1)
    setServerFilterField(tab.serverFilterFields?.[0]?.key || '')
    setServerFilterValue('')
    setAppliedFilter({ field: '', value: '' })
    setLocalSearch('')
    setPeriod('all')
    setExporting(false)
  }, [tab.id])

  // Column objects for active/inactive
  const activeColumns = useMemo(() =>
    activeKeys.map(key => tab.columns.find(c => c.key === key)).filter(Boolean),
    [activeKeys, tab.columns]
  )
  const inactiveColumns = useMemo(() =>
    tab.columns.filter(c => !activeKeys.includes(c.key)),
    [activeKeys, tab.columns]
  )

  // === Server-filtered tabs (C003): fetch page from API ===
  const loadPage = useCallback(async (pageNum, filterField, filterValue) => {
    setLoading(true)
    const ff = filterValue ? filterField : undefined
    const fv = filterValue || undefined
    const result = await fetchPage(tab.id, pageNum, PAGE_SIZE, ff, fv)
    setPageData(result.items)
    setTotalCount(result.totalCount)
    setLoading(false)
  }, [tab.id])

  useEffect(() => {
    if (isServerFilter) loadPage(1, '', '')
  }, [isServerFilter, loadPage])

  useEffect(() => {
    if (isServerFilter && page > 0) {
      loadPage(page, appliedFilter.field, appliedFilter.value)
    }
  }, [page, appliedFilter, isServerFilter, loadPage])

  // === Small-data tabs: auto-load all at once ===
  useEffect(() => {
    if (!isServerFilter && !allLoaded) {
      setLoading(true)
      fetchAllForExport(tab.id, null).then(items => {
        setAllData(items)
        setAllLoaded(true)
        setLoading(false)
      })
    }
  }, [tab.id, isServerFilter, allLoaded])

  // === Display data for small-data tabs ===
  const filteredSmallData = useMemo(() => {
    if (isServerFilter || !allLoaded) return []
    let items = allData
    items = filterByPeriod(items, tab.dateField, period)
    items = filterBySearch(items, localSearch, tab.searchFields)
    return items
  }, [allData, allLoaded, localSearch, period, tab, isServerFilter])

  const smallTotalPages = Math.ceil(filteredSmallData.length / PAGE_SIZE)
  const smallPageData = filteredSmallData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // === Which data to show in table ===
  const displayData = isServerFilter ? pageData : smallPageData
  const displayTotal = isServerFilter ? totalCount : filteredSmallData.length
  const totalPages = isServerFilter
    ? Math.ceil(totalCount / PAGE_SIZE)
    : smallTotalPages

  // === NEW count ===
  const newCount = useMemo(() => {
    if (!tab.dateField) return 0
    return displayData.filter(item => isNew(item[tab.dateField])).length
  }, [displayData, tab.dateField])

  // === Handlers ===
  function addColumn(key) {
    setActiveKeys(prev => [...prev, key])
  }

  function removeColumn(key) {
    setActiveKeys(prev => prev.filter(k => k !== key))
  }

  function moveColumn(key, dir) {
    setActiveKeys(prev => {
      const idx = prev.indexOf(key)
      if (idx < 0) return prev
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })
  }

  function handleServerSearch() {
    setAppliedFilter({ field: serverFilterField, value: serverFilterValue })
    setPage(1)
  }

  function handleServerSearchKey(e) {
    if (e.key === 'Enter') handleServerSearch()
  }

  function handleServerClear() {
    setServerFilterValue('')
    setAppliedFilter({ field: '', value: '' })
    setPage(1)
  }

  async function handleExport() {
    setExporting(true)
    setExportProgress({ current: 0, total: 0 })

    const ff = isServerFilter && appliedFilter.value ? appliedFilter.field : undefined
    const fv = isServerFilter && appliedFilter.value ? appliedFilter.value : undefined

    let items = await fetchAllForExport(
      tab.id,
      (current, total) => setExportProgress({ current, total }),
      ff, fv
    )

    // Apply local filters for small-data tabs
    if (!isServerFilter) {
      items = filterByPeriod(items, tab.dateField, period)
      items = filterBySearch(items, localSearch, tab.searchFields)
    }

    exportToExcel(items, activeColumns, tab.label)
    setExporting(false)
  }

  // === Render ===
  const isReady = isServerFilter || allLoaded || loading

  return (
    <div className="tab-view">
      {/* Description */}
      <div className="description-box">
        <ul>
          {tab.description.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      </div>

      {/* Server-filter search (C003) */}
      {isServerFilter && (
        <div className="server-filter">
          <select
            value={serverFilterField}
            onChange={e => setServerFilterField(e.target.value)}
            className="filter-select"
          >
            {tab.serverFilterFields.map(f => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
          <input
            className="search-input"
            type="text"
            placeholder="검색어 입력 후 Enter (예: 종근당, 비타민C, 오메가)"
            value={serverFilterValue}
            onChange={e => setServerFilterValue(e.target.value)}
            onKeyDown={handleServerSearchKey}
          />
          <button className="btn-primary" onClick={handleServerSearch} disabled={loading}>
            검색
          </button>
          {appliedFilter.value && (
            <button className="btn-secondary" onClick={handleServerClear}>
              초기화
            </button>
          )}
        </div>
      )}

      {/* Local filter for small-data tabs */}
      {!isServerFilter && (
        <div className="filter-row">
          {tab.dateField && (
            <div className="period-filter">
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`period-btn ${period === opt.value ? 'active' : ''}`}
                  onClick={() => { setPeriod(opt.value); setPage(1) }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <input
            className="search-input"
            type="text"
            placeholder="키워드 검색 (원료명, 기능성...)"
            value={localSearch}
            onChange={e => { setLocalSearch(e.target.value); setPage(1) }}
          />
        </div>
      )}

      {isReady && (
        <>
          {/* Stats bar */}
          <div className="stats-bar">
            <span className="total-count">
              {loading ? '검색 중...' : `총 ${displayTotal.toLocaleString()}건`}
            </span>
            {appliedFilter.value && (
              <span className="filter-badge">
                {tab.serverFilterFields.find(f => f.key === appliedFilter.field)?.label}: "{appliedFilter.value}"
              </span>
            )}
            {newCount > 0 && (
              <span className="new-badge">NEW 30일 내 신규 {newCount}건</span>
            )}
          </div>

          {/* Column selector — 확정/선택 토글 */}
          <div className="column-selector">
            <div className="column-active">
              <span className="col-section-label">확정 컬럼 <span className="col-hint">( ‹ › 화살표로 엑셀 컬럼 순서 변경 )</span></span>
              <div className="col-tags">
                {activeColumns.map((c, idx) => (
                  <span key={c.key} className="col-tag-group">
                    {idx > 0 && (
                      <button className="col-move" onClick={() => moveColumn(c.key, -1)} title="왼쪽으로">‹</button>
                    )}
                    <button
                      className="col-tag active"
                      onClick={() => removeColumn(c.key)}
                      title={c.desc || c.label}
                    >
                      {c.label} ✕
                    </button>
                    {idx < activeKeys.length - 1 && (
                      <button className="col-move" onClick={() => moveColumn(c.key, 1)} title="오른쪽으로">›</button>
                    )}
                  </span>
                ))}
              </div>
            </div>
            {inactiveColumns.length > 0 && (
              <div className="column-inactive">
                <span className="col-section-label">선택 컬럼</span>
                <div className="col-tags">
                  {inactiveColumns.map(c => (
                    <button
                      key={c.key}
                      className="col-tag inactive"
                      onClick={() => addColumn(c.key)}
                      title={c.desc || c.label}
                    >
                      + {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export button */}
          <div className="export-row">
            <button className="btn-export" onClick={handleExport} disabled={exporting || activeKeys.length === 0}>
              {exporting
                ? `수집 중... ${exportProgress.current.toLocaleString()} / ${exportProgress.total.toLocaleString()}건`
                : `엑셀 추출 (${displayTotal.toLocaleString()}건)`
              }
            </button>
            {exporting && (
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: exportProgress.total ? `${(exportProgress.current / exportProgress.total) * 100}%` : '0%' }}
                />
              </div>
            )}
          </div>

          {/* Table */}
          {activeKeys.length === 0 ? (
            <div className="empty-msg">확정 컬럼을 1개 이상 선택해주세요</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {activeColumns.map(c => <th key={c.key}>{c.label}</th>)}
                    {tab.dateField && <th>NEW</th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={activeColumns.length + (tab.dateField ? 1 : 0)} className="loading-cell">불러오는 중...</td></tr>
                  ) : displayData.length === 0 ? (
                    <tr><td colSpan={activeColumns.length + (tab.dateField ? 1 : 0)} className="loading-cell">검색 결과가 없습니다</td></tr>
                  ) : displayData.map((row, i) => (
                    <tr key={i}>
                      {activeColumns.map(c => (
                        <td key={c.key} title={row[c.key] || ''}>
                          {(row[c.key] || '').slice(0, 80)}
                          {(row[c.key] || '').length > 80 ? '...' : ''}
                        </td>
                      ))}
                      {tab.dateField && (
                        <td>{isNew(row[tab.dateField]) ? <span className="new-dot">NEW</span> : ''}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage(1)} disabled={page === 1 || loading}>{'«'}</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>{'‹'}</button>
              <span>{page} / {totalPages.toLocaleString()}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}>{'›'}</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages || loading}>{'»'}</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
