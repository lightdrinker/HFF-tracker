import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { fetchPage, fetchAllForExport } from '../api/fetchAll'
import { parseStdrStnd } from '../utils/parseStdrStnd'
import { NUTRIENT_COLUMNS, getRdaColor, getRdaTextColor } from '../config/nutrients'
import { exportNutrientExcel } from '../utils/excelNutrient'

const PAGE_SIZE = 20
const AUTO_FETCH_THRESHOLD = 1000

function rowKey(row) {
  return row.PRDLST_REPORT_NO || `${row.PRDLST_NM}_${row.BSSH_NM}`
}

// Determine the best server filter to send (only 1 allowed by API)
// Priority: search keyword > 기능성 > 제형
function pickServerFilter(appliedFilter, filterFnclty, filterShape) {
  if (appliedFilter.value) {
    return { field: appliedFilter.field, value: appliedFilter.value }
  }
  if (filterFnclty.length === 1) {
    return { field: 'PRIMARY_FNCLTY', value: filterFnclty[0] }
  }
  if (filterShape.length === 1) {
    return { field: 'PRDT_SHAP_CD_NM', value: filterShape[0] }
  }
  return { field: '', value: '' }
}

// Apply client-side filters to parsed rows
function applyClientFilters(rows, filterShape, filterFnclty, filterNutrients, filterHasOthers, serverFilter) {
  let result = rows
  // Only apply client-side if not already handled by server
  const shapeFilters = serverFilter.field === 'PRDT_SHAP_CD_NM' && filterShape.length === 1
    ? [] : filterShape
  const fncltyFilters = serverFilter.field === 'PRIMARY_FNCLTY' && filterFnclty.length === 1
    ? [] : filterFnclty

  if (shapeFilters.length > 0) {
    result = result.filter(r => shapeFilters.some(s => r.shape.includes(s)))
  }
  if (fncltyFilters.length > 0) {
    result = result.filter(r => fncltyFilters.some(f => r.fnclty.includes(f)))
  }
  if (filterNutrients.length > 0) {
    result = result.filter(r => filterNutrients.every(nk => r.nutrients[nk] != null))
  }
  if (filterHasOthers) {
    result = result.filter(r => r.others.length > 0)
  }
  return result
}

export default function NutrientAnalysisView({ tab }) {
  // Page mode data
  const [pageData, setPageData] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Full fetch mode data
  const [fullData, setFullData] = useState(null) // null = not fetched, [] = fetched
  const [fullFetching, setFullFetching] = useState(false)
  const [fullFetchProgress, setFullFetchProgress] = useState({ current: 0, total: 0 })
  const fullFetchFilterRef = useRef(null) // track which server filter was used for full fetch

  // Server filter (search bar)
  const [serverFilterField, setServerFilterField] = useState(
    tab.serverFilterFields?.[0]?.key || ''
  )
  const [serverFilterValue, setServerFilterValue] = useState('')
  const [appliedFilter, setAppliedFilter] = useState({ field: '', value: '' })

  // Cart (picked products)
  const [pickedItems, setPickedItems] = useState(new Map())
  const [viewMode, setViewMode] = useState('search')

  // Filters
  const [filterShape, setFilterShape] = useState([])
  const [filterFnclty, setFilterFnclty] = useState([])
  const [filterNutrients, setFilterNutrients] = useState([])
  const [filterHasOthers, setFilterHasOthers] = useState(false)

  // Filter dropdown open state
  const [shapeDropdownOpen, setShapeDropdownOpen] = useState(false)
  const [fncltyDropdownOpen, setFncltyDropdownOpen] = useState(false)
  const [nutrientDropdownOpen, setNutrientDropdownOpen] = useState(false)

  // Excel export
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 })

  const SHAPE_OPTIONS = ['정', '캡슐', '분말', '액상', '젤리', '환', '기타', '과립', '겔', '바', '시럽', '페이스트상', '편상']
  const FNCLTY_OPTIONS = [
    '면역', '뼈', '관절', '혈행', '혈당', '혈압', '콜레스테롤',
    '장건강', '간건강', '눈건강', '피부', '체지방', '항산화',
    '피로', '기억력', '인지', '수면', '전립선', '요로', '칼슘',
  ]

  // Compute current server filter
  const serverFilter = useMemo(
    () => pickServerFilter(appliedFilter, filterFnclty, filterShape),
    [appliedFilter, filterFnclty, filterShape]
  )

  const hasActiveFilters = filterShape.length > 0 || filterFnclty.length > 0
    || filterNutrients.length > 0 || filterHasOthers

  // Is full data mode active?
  const isFullMode = fullData !== null && !fullFetching
  // Does full data match current server filter?
  const fullDataMatchesFilter = fullFetchFilterRef.current !== null
    && fullFetchFilterRef.current.field === serverFilter.field
    && fullFetchFilterRef.current.value === serverFilter.value

  // ── Data fetching ──

  // Page mode fetch
  const loadPage = useCallback(async (pageNum, sf) => {
    setLoading(true)
    const ff = sf.value ? sf.field : undefined
    const fv = sf.value || undefined
    const result = await fetchPage('C003', pageNum, PAGE_SIZE, ff, fv)
    setPageData(result.items)
    setTotalCount(result.totalCount)
    setLoading(false)
  }, [])

  // Initial load
  useEffect(() => { loadPage(1, { field: '', value: '' }) }, [loadPage])

  // When server filter or page changes → reload page data
  useEffect(() => {
    // If full data is available and matches, skip page fetch
    if (isFullMode && fullDataMatchesFilter) return
    loadPage(page, serverFilter)
  }, [page, serverFilter, loadPage, isFullMode, fullDataMatchesFilter])

  // Auto full-fetch when totalCount <= threshold and filters active
  useEffect(() => {
    if (!hasActiveFilters) return
    if (fullFetching) return
    if (isFullMode && fullDataMatchesFilter) return
    if (totalCount > 0 && totalCount <= AUTO_FETCH_THRESHOLD) {
      doFullFetch()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCount, hasActiveFilters, serverFilter])

  // Reset full data when server filter changes
  useEffect(() => {
    if (fullFetchFilterRef.current
      && (fullFetchFilterRef.current.field !== serverFilter.field
        || fullFetchFilterRef.current.value !== serverFilter.value)) {
      setFullData(null)
      fullFetchFilterRef.current = null
    }
  }, [serverFilter])

  async function doFullFetch() {
    setFullFetching(true)
    setFullFetchProgress({ current: 0, total: 0 })
    const ff = serverFilter.value ? serverFilter.field : undefined
    const fv = serverFilter.value || undefined
    const items = await fetchAllForExport(
      'C003',
      (current, total) => setFullFetchProgress({ current, total }),
      ff, fv
    )
    fullFetchFilterRef.current = { ...serverFilter }
    setFullData(items)
    setFullFetching(false)
  }

  // ── Parsed rows ──

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // Parse page data
  const parsedPageRows = useMemo(() =>
    pageData.map(row => ({
      name: row.PRDLST_NM || '',
      company: row.BSSH_NM || '',
      shape: row.PRDT_SHAP_CD_NM || '',
      fnclty: row.PRIMARY_FNCLTY || '',
      ...parseStdrStnd(row.STDR_STND),
      _raw: row,
      _key: rowKey(row),
    })), [pageData])

  // Parse full data
  const parsedFullRows = useMemo(() => {
    if (!fullData) return []
    return fullData.map(row => ({
      name: row.PRDLST_NM || '',
      company: row.BSSH_NM || '',
      shape: row.PRDT_SHAP_CD_NM || '',
      fnclty: row.PRIMARY_FNCLTY || '',
      ...parseStdrStnd(row.STDR_STND),
      _raw: row,
      _key: rowKey(row),
    }))
  }, [fullData])

  // Parse picked items
  const parsedPicked = useMemo(() =>
    Array.from(pickedItems.values()).map(row => ({
      name: row.PRDLST_NM || '',
      company: row.BSSH_NM || '',
      shape: row.PRDT_SHAP_CD_NM || '',
      fnclty: row.PRIMARY_FNCLTY || '',
      ...parseStdrStnd(row.STDR_STND),
      _raw: row,
      _key: rowKey(row),
    })), [pickedItems])

  // Apply client filters
  const filteredFull = useMemo(() => {
    if (!isFullMode || !fullDataMatchesFilter) return []
    return applyClientFilters(parsedFullRows, filterShape, filterFnclty, filterNutrients, filterHasOthers, serverFilter)
  }, [parsedFullRows, filterShape, filterFnclty, filterNutrients, filterHasOthers, serverFilter, isFullMode, fullDataMatchesFilter])

  const filteredPage = useMemo(() =>
    applyClientFilters(parsedPageRows, filterShape, filterFnclty, filterNutrients, filterHasOthers, serverFilter),
    [parsedPageRows, filterShape, filterFnclty, filterNutrients, filterHasOthers, serverFilter])

  const filteredPicked = useMemo(() =>
    applyClientFilters(parsedPicked, filterShape, filterFnclty, filterNutrients, filterHasOthers, serverFilter),
    [parsedPicked, filterShape, filterFnclty, filterNutrients, filterHasOthers, serverFilter])

  // Choose what to display
  const useFullData = isFullMode && fullDataMatchesFilter
  const displayRows = viewMode === 'picked'
    ? filteredPicked
    : useFullData ? filteredFull : filteredPage

  const displayTotalCount = viewMode === 'picked'
    ? filteredPicked.length
    : useFullData ? filteredFull.length : totalCount

  // Pagination for full mode
  const [fullPage, setFullPage] = useState(1)
  const FULL_PAGE_SIZE = 50
  const fullTotalPages = Math.ceil(displayRows.length / FULL_PAGE_SIZE)

  // Reset fullPage when filters change
  useEffect(() => { setFullPage(1) }, [filterShape, filterFnclty, filterNutrients, filterHasOthers])

  const pagedDisplayRows = viewMode === 'picked'
    ? displayRows
    : useFullData
      ? displayRows.slice((fullPage - 1) * FULL_PAGE_SIZE, fullPage * FULL_PAGE_SIZE)
      : displayRows

  const isAllCurrentPicked = pagedDisplayRows.length > 0 && pagedDisplayRows.every(r => pickedItems.has(r._key))

  // ── Handlers ──

  function handleSearch() {
    setAppliedFilter({ field: serverFilterField, value: serverFilterValue })
    setPage(1)
    setFullPage(1)
    setFullData(null)
    fullFetchFilterRef.current = null
    setViewMode('search')
  }
  function handleSearchKey(e) {
    if (e.key === 'Enter') handleSearch()
  }
  function handleClear() {
    setServerFilterValue('')
    setAppliedFilter({ field: '', value: '' })
    setFilterShape([])
    setFilterFnclty([])
    setFilterNutrients([])
    setFilterHasOthers(false)
    setPage(1)
    setFullPage(1)
    setFullData(null)
    fullFetchFilterRef.current = null
    setViewMode('search')
  }

  function togglePick(row) {
    const key = rowKey(row)
    setPickedItems(prev => {
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else next.set(key, row)
      return next
    })
  }

  function togglePickAll() {
    setPickedItems(prev => {
      const next = new Map(prev)
      if (isAllCurrentPicked) {
        pagedDisplayRows.forEach(r => next.delete(r._key))
      } else {
        pagedDisplayRows.forEach(r => next.set(r._key, r._raw))
      }
      return next
    })
  }

  function clearAllPicks() {
    setPickedItems(new Map())
    setViewMode('search')
  }

  function toggleFilter(setArr, val) {
    setArr(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val])
  }

  function clearFilters() {
    setFilterShape([])
    setFilterFnclty([])
    setFilterNutrients([])
    setFilterHasOthers(false)
  }

  // Export
  async function handleExportPicked() {
    exportNutrientExcel(Array.from(pickedItems.values()))
  }

  async function handleExportSearch() {
    if (useFullData) {
      // Already have full data — apply filters and export
      const items = filteredFull.map(r => r._raw)
      exportNutrientExcel(items)
      return
    }
    setExporting(true)
    setExportProgress({ current: 0, total: 0 })
    const ff = serverFilter.value ? serverFilter.field : undefined
    const fv = serverFilter.value || undefined
    const items = await fetchAllForExport(
      'C003',
      (current, total) => setExportProgress({ current, total }),
      ff, fv
    )
    // Apply client filters to fetched data
    if (hasActiveFilters) {
      const parsed = items.map(row => ({
        shape: row.PRDT_SHAP_CD_NM || '',
        fnclty: row.PRIMARY_FNCLTY || '',
        ...parseStdrStnd(row.STDR_STND),
        _raw: row,
      }))
      const filtered = applyClientFilters(parsed, filterShape, filterFnclty, filterNutrients, filterHasOthers, serverFilter)
      exportNutrientExcel(filtered.map(r => r._raw))
    } else {
      exportNutrientExcel(items)
    }
    setExporting(false)
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e) {
      if (!e.target.closest('.multi-filter-group')) {
        setShapeDropdownOpen(false)
        setFncltyDropdownOpen(false)
        setNutrientDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  return (
    <div className="tab-view">
      {/* Description */}
      <div className="description-box">
        <ul>
          {tab.description.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      </div>

      {/* Search */}
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
          placeholder="검색어 입력 후 Enter (예: 센트룸, 종근당)"
          value={serverFilterValue}
          onChange={e => setServerFilterValue(e.target.value)}
          onKeyDown={handleSearchKey}
        />
        <button className="btn-primary" onClick={handleSearch} disabled={loading}>검색</button>
        {(appliedFilter.value || hasActiveFilters) && (
          <button className="btn-secondary" onClick={handleClear}>초기화</button>
        )}
      </div>

      {/* Stats + View Toggle */}
      <div className="stats-bar">
        <span className="total-count">
          {loading && !useFullData ? '검색 중...'
            : `총 ${displayTotalCount.toLocaleString()}건`
          }
          {!useFullData && hasActiveFilters && !fullFetching && viewMode === 'search' && (
            <span className="count-approx"> (필터 미반영)</span>
          )}
        </span>
        {appliedFilter.value && viewMode === 'search' && (
          <span className="filter-badge">
            {tab.serverFilterFields.find(f => f.key === appliedFilter.field)?.label}: &quot;{appliedFilter.value}&quot;
          </span>
        )}

        {/* View mode toggle */}
        <div className="view-toggle">
          <button
            className={`view-toggle-btn ${viewMode === 'search' ? 'active' : ''}`}
            onClick={() => setViewMode('search')}
          >
            검색결과
          </button>
          <button
            className={`view-toggle-btn picked ${viewMode === 'picked' ? 'active' : ''}`}
            onClick={() => setViewMode('picked')}
            disabled={pickedItems.size === 0}
          >
            픽 목록 ({pickedItems.size})
          </button>
        </div>
      </div>

      {/* Filters — always visible */}
      <div className="filter-section">
        <div className="filter-section-header">
          <span className="filter-section-title">상세 필터</span>
          {hasActiveFilters && (
            <span className="filter-count">{filterShape.length + filterFnclty.length + filterNutrients.length + (filterHasOthers ? 1 : 0)}</span>
          )}
        </div>
        <div className="filter-section-body">
          {/* 제형 */}
          <div className="multi-filter-group">
            <div className="multi-filter-header" onClick={() => { setShapeDropdownOpen(!shapeDropdownOpen); setFncltyDropdownOpen(false); setNutrientDropdownOpen(false) }}>
              <span className="multi-filter-label">제형</span>
              <span className="multi-filter-value">
                {filterShape.length === 0 ? '전체' : filterShape.join(', ')}
              </span>
              <span className="multi-filter-arrow">{shapeDropdownOpen ? '▲' : '▼'}</span>
            </div>
            {shapeDropdownOpen && (
              <div className="multi-filter-dropdown">
                {SHAPE_OPTIONS.map(opt => (
                  <label key={opt} className="multi-filter-option">
                    <input type="checkbox" checked={filterShape.includes(opt)} onChange={() => toggleFilter(setFilterShape, opt)} />
                    {opt}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 기능성 */}
          <div className="multi-filter-group">
            <div className="multi-filter-header" onClick={() => { setFncltyDropdownOpen(!fncltyDropdownOpen); setShapeDropdownOpen(false); setNutrientDropdownOpen(false) }}>
              <span className="multi-filter-label">기능성</span>
              <span className="multi-filter-value">
                {filterFnclty.length === 0 ? '전체' : filterFnclty.join(', ')}
              </span>
              <span className="multi-filter-arrow">{fncltyDropdownOpen ? '▲' : '▼'}</span>
            </div>
            {fncltyDropdownOpen && (
              <div className="multi-filter-dropdown">
                {FNCLTY_OPTIONS.map(opt => (
                  <label key={opt} className="multi-filter-option">
                    <input type="checkbox" checked={filterFnclty.includes(opt)} onChange={() => toggleFilter(setFilterFnclty, opt)} />
                    {opt}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 영양성분 포함 */}
          <div className="multi-filter-group">
            <div className="multi-filter-header" onClick={() => { setNutrientDropdownOpen(!nutrientDropdownOpen); setShapeDropdownOpen(false); setFncltyDropdownOpen(false) }}>
              <span className="multi-filter-label">영양성분 포함</span>
              <span className="multi-filter-value">
                {filterNutrients.length === 0 && !filterHasOthers
                  ? '전체'
                  : [
                    ...filterNutrients.map(k => NUTRIENT_COLUMNS.find(n => n.key === k)?.name),
                    ...(filterHasOthers ? ['기타'] : []),
                  ].join(', ')
                }
              </span>
              <span className="multi-filter-arrow">{nutrientDropdownOpen ? '▲' : '▼'}</span>
            </div>
            {nutrientDropdownOpen && (
              <div className="multi-filter-dropdown nutrient-dropdown">
                {NUTRIENT_COLUMNS.map(n => (
                  <label key={n.key} className="multi-filter-option">
                    <input type="checkbox" checked={filterNutrients.includes(n.key)} onChange={() => toggleFilter(setFilterNutrients, n.key)} />
                    {n.name}
                  </label>
                ))}
                <label className="multi-filter-option multi-filter-option-divider">
                  <input type="checkbox" checked={filterHasOthers} onChange={() => setFilterHasOthers(!filterHasOthers)} />
                  기타 기능성원료
                </label>
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <button className="btn-filter-clear" onClick={clearFilters}>필터 초기화</button>
          )}
        </div>
      </div>

      {/* Full fetch prompt — when filter active but data too large for auto-fetch */}
      {hasActiveFilters && !useFullData && !fullFetching && totalCount > AUTO_FETCH_THRESHOLD && viewMode === 'search' && (
        <div className="full-fetch-prompt">
          <span>
            현재 검색 결과가 {totalCount.toLocaleString()}건입니다.
            전체 데이터를 불러오면 정확한 필터링과 건수 확인이 가능합니다.
          </span>
          <button className="btn-primary" style={{ padding: '6px 16px', fontSize: '13px' }} onClick={doFullFetch}>
            전체 불러오기
          </button>
        </div>
      )}

      {/* Full fetch progress */}
      {fullFetching && (
        <div className="full-fetch-prompt">
          <span>전체 데이터 불러오는 중... {fullFetchProgress.current.toLocaleString()} / {fullFetchProgress.total.toLocaleString()}건</span>
          <div className="progress-bar" style={{ flex: 1, maxWidth: '300px' }}>
            <div className="progress-fill" style={{ width: fullFetchProgress.total ? `${(fullFetchProgress.current / fullFetchProgress.total) * 100}%` : '0%' }} />
          </div>
        </div>
      )}

      {/* Picked items tags */}
      {pickedItems.size > 0 && (
        <div className="pick-tags-bar">
          <span className="pick-tags-label">픽:</span>
          <div className="pick-tags-list">
            {Array.from(pickedItems.values()).map(item => (
              <span key={rowKey(item)} className="pick-tag">
                {item.PRDLST_NM?.slice(0, 20)}{item.PRDLST_NM?.length > 20 ? '…' : ''}
                <button className="pick-tag-remove" onClick={() => togglePick(item)}>✕</button>
              </span>
            ))}
          </div>
          <button className="pick-clear-all" onClick={clearAllPicks}>전체 해제</button>
        </div>
      )}

      {/* RDA Legend */}
      <div className="rda-legend">
        <span className="rda-legend-label">RDA%</span>
        <span className="rda-legend-item" style={{ background: '#166534', color: '#fff' }}>100%+</span>
        <span className="rda-legend-item" style={{ background: '#4ade80' }}>75%</span>
        <span className="rda-legend-item" style={{ background: '#facc15' }}>50%</span>
        <span className="rda-legend-item" style={{ background: '#fb923c' }}>30%</span>
        <span className="rda-legend-item" style={{ background: '#f87171' }}>&lt;30%</span>
      </div>

      {/* Export */}
      <div className="export-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {viewMode === 'picked' ? (
          <button className="btn-export" onClick={handleExportPicked} disabled={pickedItems.size === 0}>
            엑셀 추출 (픽 {pickedItems.size}건)
          </button>
        ) : (
          <button className="btn-export" onClick={handleExportSearch} disabled={exporting}>
            {exporting
              ? `수집 중... ${exportProgress.current.toLocaleString()} / ${exportProgress.total.toLocaleString()}건`
              : `엑셀 추출 (${displayTotalCount.toLocaleString()}건)`
            }
          </button>
        )}
        {pickedItems.size > 0 && viewMode === 'search' && (
          <button className="btn-export" style={{ background: '#7c3aed' }} onClick={handleExportPicked}>
            픽 엑셀 추출 ({pickedItems.size}건)
          </button>
        )}
        {exporting && (
          <div className="progress-bar" style={{ flex: 1 }}>
            <div className="progress-fill" style={{ width: exportProgress.total ? `${(exportProgress.current / exportProgress.total) * 100}%` : '0%' }} />
          </div>
        )}
      </div>

      {/* Nutrient Table */}
      <div className="nutrient-table-wrapper">
        <table className="nutrient-table">
          <thead>
            <tr>
              <th className="nt-sticky nt-sticky-check" rowSpan={2}>
                <input
                  type="checkbox"
                  checked={isAllCurrentPicked}
                  onChange={togglePickAll}
                  title="현재 목록 전체 선택/해제"
                />
              </th>
              <th className="nt-sticky nt-sticky-name" rowSpan={2}>제품명</th>
              <th className="nt-sticky nt-sticky-company" rowSpan={2}>회사명</th>
              <th className="nt-section-header" colSpan={NUTRIENT_COLUMNS.length}>영양성분 &gt;&gt;</th>
              <th rowSpan={2} className="nt-other-header">기타 기능성원료</th>
            </tr>
            <tr>
              {NUTRIENT_COLUMNS.map(n => (
                <th key={n.key} className="nt-rda-cell">
                  <div className="nt-rda-name">{n.name}</div>
                  <div className="nt-rda-value">{n.rda} {n.unit}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(loading || fullFetching) && viewMode === 'search' && !useFullData ? (
              <tr>
                <td colSpan={NUTRIENT_COLUMNS.length + 4} className="loading-cell">
                  불러오는 중...
                </td>
              </tr>
            ) : pagedDisplayRows.length === 0 ? (
              <tr>
                <td colSpan={NUTRIENT_COLUMNS.length + 4} className="loading-cell">
                  {viewMode === 'picked' ? '픽한 제품이 없습니다' : '검색 결과가 없습니다'}
                </td>
              </tr>
            ) : pagedDisplayRows.map((row) => {
              const isPicked = pickedItems.has(row._key)
              return (
                <tr key={row._key} className={isPicked ? 'row-picked' : ''}>
                  <td className="nt-sticky nt-sticky-check">
                    <input type="checkbox" checked={isPicked} onChange={() => togglePick(row._raw)} />
                  </td>
                  <td className="nt-sticky nt-sticky-name" title={row.name}>{row.name}</td>
                  <td className="nt-sticky nt-sticky-company" title={row.company}>{row.company}</td>
                  {NUTRIENT_COLUMNS.map(n => {
                    const val = row.nutrients[n.key]
                    const bg = getRdaColor(val, n.rda)
                    const fg = getRdaTextColor(val, n.rda)
                    return (
                      <td
                        key={n.key}
                        className="nt-value-cell"
                        style={bg ? { backgroundColor: bg, color: fg } : {}}
                        title={val ? `${val} / RDA ${n.rda} ${n.unit} (${Math.round((val / n.rda) * 100)}%)` : ''}
                      >
                        {val != null ? val.toLocaleString() : ''}
                      </td>
                    )
                  })}
                  <td className="nt-other-cell">
                    {row.others.length > 0 ? row.others.join(', ') : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {viewMode === 'search' && (
        useFullData ? (
          fullTotalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setFullPage(1)} disabled={fullPage === 1}>{'«'}</button>
              <button onClick={() => setFullPage(p => Math.max(1, p - 1))} disabled={fullPage === 1}>{'‹'}</button>
              <span>{fullPage} / {fullTotalPages.toLocaleString()}</span>
              <button onClick={() => setFullPage(p => Math.min(fullTotalPages, p + 1))} disabled={fullPage === fullTotalPages}>{'›'}</button>
              <button onClick={() => setFullPage(fullTotalPages)} disabled={fullPage === fullTotalPages}>{'»'}</button>
            </div>
          )
        ) : (
          totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage(1)} disabled={page === 1 || loading}>{'«'}</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>{'‹'}</button>
              <span>{page} / {totalPages.toLocaleString()}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}>{'›'}</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages || loading}>{'»'}</button>
            </div>
          )
        )
      )}
    </div>
  )
}
