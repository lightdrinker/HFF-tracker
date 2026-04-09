import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchPage, fetchAllForExport } from '../api/fetchAll'
import { parseStdrStnd } from '../utils/parseStdrStnd'
import { NUTRIENT_COLUMNS, getRdaColor, getRdaTextColor } from '../config/nutrients'
import { exportNutrientExcel } from '../utils/excelNutrient'

const PAGE_SIZE = 20

// Unique key for a product row
function rowKey(row) {
  return row.PRDLST_REPORT_NO || `${row.PRDLST_NM}_${row.BSSH_NM}`
}

export default function NutrientAnalysisView({ tab }) {
  const [pageData, setPageData] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Server filter (search)
  const [serverFilterField, setServerFilterField] = useState(
    tab.serverFilterFields?.[0]?.key || ''
  )
  const [serverFilterValue, setServerFilterValue] = useState('')
  const [appliedFilter, setAppliedFilter] = useState({ field: '', value: '' })

  // Cart (picked products)
  const [pickedItems, setPickedItems] = useState(new Map()) // key -> raw row
  const [viewMode, setViewMode] = useState('search') // 'search' | 'picked'

  // Filters
  const [showFilters, setShowFilters] = useState(false)
  const [filterShape, setFilterShape] = useState([])     // 제형 multi-select
  const [filterFnclty, setFilterFnclty] = useState([])   // 기능성 multi-select
  const [filterNutrients, setFilterNutrients] = useState([]) // 영양성분 포함 필터

  // Filter dropdown open state
  const [shapeDropdownOpen, setShapeDropdownOpen] = useState(false)
  const [fncltyDropdownOpen, setFncltyDropdownOpen] = useState(false)
  const [nutrientDropdownOpen, setNutrientDropdownOpen] = useState(false)

  // Excel export
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 })

  // Predefined filter options
  const SHAPE_OPTIONS = ['정제', '캡슐', '연질캡슐', '경질캡슐', '분말', '과립', '액상', '젤리', '환', '시럽', '바']
  const FNCLTY_OPTIONS = [
    '면역', '뼈', '관절', '혈행', '혈당', '혈압', '콜레스테롤',
    '장건강', '간건강', '눈건강', '피부', '체지방', '항산화',
    '피로', '기억력', '인지', '수면', '전립선', '요로', '칼슘',
  ]

  // Fetch page
  const loadPage = useCallback(async (pageNum, filterField, filterValue) => {
    setLoading(true)
    const ff = filterValue ? filterField : undefined
    const fv = filterValue || undefined
    const result = await fetchPage('C003', pageNum, PAGE_SIZE, ff, fv)
    setPageData(result.items)
    setTotalCount(result.totalCount)
    setLoading(false)
  }, [])

  useEffect(() => { loadPage(1, '', '') }, [loadPage])

  useEffect(() => {
    if (page > 0) loadPage(page, appliedFilter.field, appliedFilter.value)
  }, [page, appliedFilter, loadPage])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // Parse STDR_STND for display rows
  const parsedRows = useMemo(() =>
    pageData.map(row => ({
      name: row.PRDLST_NM || '',
      company: row.BSSH_NM || '',
      shape: row.PRDT_SHAP_CD_NM || '',
      fnclty: row.PRIMARY_FNCLTY || '',
      ...parseStdrStnd(row.STDR_STND),
      _raw: row,
      _key: rowKey(row),
    })), [pageData])

  // Parse picked items for picked view
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

  // Client-side filtering for picked view
  const filteredPicked = useMemo(() => {
    let rows = parsedPicked
    if (filterShape.length > 0) {
      rows = rows.filter(r => filterShape.some(s => r.shape.includes(s)))
    }
    if (filterFnclty.length > 0) {
      rows = rows.filter(r => filterFnclty.some(f => r.fnclty.includes(f)))
    }
    if (filterNutrients.length > 0) {
      rows = rows.filter(r => filterNutrients.every(nk => r.nutrients[nk] != null))
    }
    return rows
  }, [parsedPicked, filterShape, filterFnclty, filterNutrients])

  // Client-side filtering for search view (제형, 기능성, 영양성분)
  const filteredSearch = useMemo(() => {
    let rows = parsedRows
    if (filterShape.length > 0) {
      rows = rows.filter(r => filterShape.some(s => r.shape.includes(s)))
    }
    if (filterFnclty.length > 0) {
      rows = rows.filter(r => filterFnclty.some(f => r.fnclty.includes(f)))
    }
    if (filterNutrients.length > 0) {
      rows = rows.filter(r => filterNutrients.every(nk => r.nutrients[nk] != null))
    }
    return rows
  }, [parsedRows, filterShape, filterFnclty, filterNutrients])

  const displayRows = viewMode === 'picked' ? filteredPicked : filteredSearch
  const isAllCurrentPicked = displayRows.length > 0 && displayRows.every(r => pickedItems.has(r._key))

  // Handlers
  function handleSearch() {
    setAppliedFilter({ field: serverFilterField, value: serverFilterValue })
    setPage(1)
    setViewMode('search')
  }
  function handleSearchKey(e) {
    if (e.key === 'Enter') handleSearch()
  }
  function handleClear() {
    setServerFilterValue('')
    setAppliedFilter({ field: '', value: '' })
    setPage(1)
    setViewMode('search')
  }

  function togglePick(row) {
    const key = rowKey(row)
    setPickedItems(prev => {
      const next = new Map(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, row)
      }
      return next
    })
  }

  function togglePickAll() {
    setPickedItems(prev => {
      const next = new Map(prev)
      if (isAllCurrentPicked) {
        // Uncheck all currently displayed
        displayRows.forEach(r => next.delete(r._key))
      } else {
        // Check all currently displayed
        displayRows.forEach(r => next.set(r._key, r._raw))
      }
      return next
    })
  }

  function clearAllPicks() {
    setPickedItems(new Map())
    setViewMode('search')
  }

  // Multi-select filter toggle
  function toggleFilter(arr, setArr, val) {
    setArr(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val])
  }

  function clearFilters() {
    setFilterShape([])
    setFilterFnclty([])
    setFilterNutrients([])
  }

  const hasActiveFilters = filterShape.length > 0 || filterFnclty.length > 0 || filterNutrients.length > 0

  // Export picked items
  async function handleExportPicked() {
    const items = Array.from(pickedItems.values())
    exportNutrientExcel(items)
  }

  // Export search results (all matching from server)
  async function handleExportSearch() {
    setExporting(true)
    setExportProgress({ current: 0, total: 0 })
    const ff = appliedFilter.value ? appliedFilter.field : undefined
    const fv = appliedFilter.value ? appliedFilter.value : undefined
    const items = await fetchAllForExport(
      'C003',
      (current, total) => setExportProgress({ current, total }),
      ff, fv
    )
    exportNutrientExcel(items)
    setExporting(false)
  }

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
        {appliedFilter.value && (
          <button className="btn-secondary" onClick={handleClear}>초기화</button>
        )}
      </div>

      {/* Stats + View Toggle */}
      <div className="stats-bar">
        <span className="total-count">
          {loading ? '검색 중...' : viewMode === 'search'
            ? `총 ${totalCount.toLocaleString()}건`
            : `픽한 제품 ${pickedItems.size}건`
          }
        </span>
        {appliedFilter.value && viewMode === 'search' && (
          <span className="filter-badge">
            {tab.serverFilterFields.find(f => f.key === appliedFilter.field)?.label}: &quot;{appliedFilter.value}&quot;
          </span>
        )}
        {hasActiveFilters && (
          <span className="filter-badge" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
            필터 적용 중
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

      {/* Filters accordion */}
      <div className="filter-accordion">
        <button className="filter-accordion-toggle" onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? '▼' : '▶'} 상세 필터
          {hasActiveFilters && <span className="filter-count">{filterShape.length + filterFnclty.length + filterNutrients.length}</span>}
        </button>
        {showFilters && (
          <div className="filter-accordion-body">
            {/* 제형 필터 */}
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
                      <input
                        type="checkbox"
                        checked={filterShape.includes(opt)}
                        onChange={() => toggleFilter(filterShape, setFilterShape, opt)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 기능성 필터 */}
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
                      <input
                        type="checkbox"
                        checked={filterFnclty.includes(opt)}
                        onChange={() => toggleFilter(filterFnclty, setFilterFnclty, opt)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 영양성분 포함 필터 */}
            <div className="multi-filter-group">
              <div className="multi-filter-header" onClick={() => { setNutrientDropdownOpen(!nutrientDropdownOpen); setShapeDropdownOpen(false); setFncltyDropdownOpen(false) }}>
                <span className="multi-filter-label">영양성분 포함</span>
                <span className="multi-filter-value">
                  {filterNutrients.length === 0 ? '전체' : filterNutrients.map(k => NUTRIENT_COLUMNS.find(n => n.key === k)?.name).join(', ')}
                </span>
                <span className="multi-filter-arrow">{nutrientDropdownOpen ? '▲' : '▼'}</span>
              </div>
              {nutrientDropdownOpen && (
                <div className="multi-filter-dropdown nutrient-dropdown">
                  {NUTRIENT_COLUMNS.map(n => (
                    <label key={n.key} className="multi-filter-option">
                      <input
                        type="checkbox"
                        checked={filterNutrients.includes(n.key)}
                        onChange={() => toggleFilter(filterNutrients, setFilterNutrients, n.key)}
                      />
                      {n.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {hasActiveFilters && (
              <button className="btn-filter-clear" onClick={clearFilters}>필터 초기화</button>
            )}
          </div>
        )}
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
              : `엑셀 추출 (${totalCount.toLocaleString()}건)`
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
            <div
              className="progress-fill"
              style={{ width: exportProgress.total ? `${(exportProgress.current / exportProgress.total) * 100}%` : '0%' }}
            />
          </div>
        )}
      </div>

      {/* Nutrient Table */}
      <div className="nutrient-table-wrapper">
        <table className="nutrient-table">
          <thead>
            {/* Row 1: Column names */}
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
            {/* Row 2: RDA values */}
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
            {loading && viewMode === 'search' ? (
              <tr>
                <td colSpan={NUTRIENT_COLUMNS.length + 4} className="loading-cell">
                  불러오는 중...
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={NUTRIENT_COLUMNS.length + 4} className="loading-cell">
                  {viewMode === 'picked' ? '픽한 제품이 없습니다' : '검색 결과가 없습니다'}
                </td>
              </tr>
            ) : displayRows.map((row, i) => {
              const isPicked = pickedItems.has(row._key)
              return (
                <tr key={row._key} className={isPicked ? 'row-picked' : ''}>
                  <td className="nt-sticky nt-sticky-check">
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() => togglePick(row._raw)}
                    />
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

      {/* Pagination (only in search mode) */}
      {viewMode === 'search' && totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setPage(1)} disabled={page === 1 || loading}>{'«'}</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>{'‹'}</button>
          <span>{page} / {totalPages.toLocaleString()}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}>{'›'}</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages || loading}>{'»'}</button>
        </div>
      )}
    </div>
  )
}
