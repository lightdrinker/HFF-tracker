import { useState, useEffect, useMemo, useCallback } from 'react'
import { fetchPage, fetchAllForExport } from '../api/fetchAll'
import { filterByPeriod, filterBySearch, expandByIngredient, isNew } from '../utils/filter'
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
  // Server-filter mode (C003)
  const isServerFilter = tab.useServerFilter

  // For server-filtered tabs: paginated display
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

  // For small-data tabs: all data loaded at once
  const [allData, setAllData] = useState([])
  const [allLoaded, setAllLoaded] = useState(false)

  // Common
  const [localSearch, setLocalSearch] = useState('')
  const [period, setPeriod] = useState('all')
  const [selectedOptional, setSelectedOptional] = useState([])

  // Excel export
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 })

  // Reset on tab change
  useEffect(() => {
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
    setSelectedOptional([])
    setExporting(false)
  }, [tab.id])

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

  // Initial load for server-filtered tabs
  useEffect(() => {
    if (isServerFilter) {
      loadPage(1, '', '')
    }
  }, [isServerFilter, loadPage])

  // Page change for server-filtered tabs
  useEffect(() => {
    if (isServerFilter && page > 0) {
      loadPage(page, appliedFilter.field, appliedFilter.value)
    }
  }, [page, appliedFilter, isServerFilter, loadPage])

  // === Small-data tabs: load all at once ===
  async function loadAllData() {
    setLoading(true)
    const { fetchAllForExport: fetchAll } = await import('../api/fetchAll')
    const items = await fetchAll(tab.id, null)
    setAllData(items)
    setAllLoaded(true)
    setLoading(false)
  }

  // === Column logic ===
  const activeColumns = useMemo(() => {
    const optional = tab.optionalColumns.filter(c => selectedOptional.includes(c.key))
    return [...tab.fixedColumns, ...optional]
  }, [tab, selectedOptional])

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

  function toggleOptional(key) {
    setSelectedOptional(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
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

    // Expand ingredients if selected
    const hasSplit = selectedOptional.includes('RAWMTRL_NM') &&
      tab.optionalColumns.find(c => c.key === 'RAWMTRL_NM')?.splitRows
    if (hasSplit) items = expandByIngredient(items)

    exportToExcel(items, activeColumns, tab.label)
    setExporting(false)
  }

  // === Render ===
  const isReady = isServerFilter || allLoaded

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

      {/* Load button for small-data tabs */}
      {!isServerFilter && !allLoaded && (
        <div className="load-section">
          <button className="btn-primary" onClick={loadAllData} disabled={loading}>
            {loading ? '불러오는 중...' : '데이터 불러오기'}
          </button>
          {loading && <span className="loading-hint">데이터를 가져오는 중입니다. 잠시만 기다려주세요.</span>}
        </div>
      )}

      {/* Local filter for small-data tabs */}
      {!isServerFilter && allLoaded && (
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

          {/* Column selector */}
          <div className="column-selector">
            <div className="column-fixed">
              <span className="col-label-fixed">고정 컬럼</span>
              {tab.fixedColumns.map(c => (
                <span key={c.key} className="col-tag fixed">{c.label}</span>
              ))}
            </div>
            <div className="column-optional">
              <span className="col-label-optional">선택 컬럼</span>
              {tab.optionalColumns.map(c => (
                <label key={c.key} className="col-checkbox" title={c.desc}>
                  <input
                    type="checkbox"
                    checked={selectedOptional.includes(c.key)}
                    onChange={() => toggleOptional(c.key)}
                  />
                  {c.label}
                  {c.splitRows && <span className="split-hint"> (행 분리)</span>}
                </label>
              ))}
            </div>
          </div>

          {/* Export button */}
          <div className="export-row">
            <button className="btn-export" onClick={handleExport} disabled={exporting}>
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
