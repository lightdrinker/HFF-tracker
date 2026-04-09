import { useState, useEffect, useCallback } from 'react'
import { fetchPage, fetchAllForExport } from '../api/fetchAll'
import { parseStdrStnd } from '../utils/parseStdrStnd'
import { NUTRIENT_COLUMNS, getRdaColor, getRdaTextColor } from '../config/nutrients'
import { exportNutrientExcel } from '../utils/excelNutrient'

const PAGE_SIZE = 20

export default function NutrientAnalysisView({ tab }) {
  const [pageData, setPageData] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Server filter
  const [serverFilterField, setServerFilterField] = useState(
    tab.serverFilterFields?.[0]?.key || ''
  )
  const [serverFilterValue, setServerFilterValue] = useState('')
  const [appliedFilter, setAppliedFilter] = useState({ field: '', value: '' })

  // Excel export
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 })

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
  const parsedRows = pageData.map(row => ({
    name: row.PRDLST_NM || '',
    company: row.BSSH_NM || '',
    ...parseStdrStnd(row.STDR_STND),
    _raw: row,
  }))

  // Handlers
  function handleSearch() {
    setAppliedFilter({ field: serverFilterField, value: serverFilterValue })
    setPage(1)
  }
  function handleSearchKey(e) {
    if (e.key === 'Enter') handleSearch()
  }
  function handleClear() {
    setServerFilterValue('')
    setAppliedFilter({ field: '', value: '' })
    setPage(1)
  }

  async function handleExport() {
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

      {/* Stats */}
      <div className="stats-bar">
        <span className="total-count">
          {loading ? '검색 중...' : `총 ${totalCount.toLocaleString()}건`}
        </span>
        {appliedFilter.value && (
          <span className="filter-badge">
            {tab.serverFilterFields.find(f => f.key === appliedFilter.field)?.label}: &quot;{appliedFilter.value}&quot;
          </span>
        )}
      </div>

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
      <div className="export-row">
        <button className="btn-export" onClick={handleExport} disabled={exporting}>
          {exporting
            ? `수집 중... ${exportProgress.current.toLocaleString()} / ${exportProgress.total.toLocaleString()}건`
            : `엑셀 추출 (${totalCount.toLocaleString()}건)`
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

      {/* Nutrient Table */}
      <div className="nutrient-table-wrapper">
        <table className="nutrient-table">
          <thead>
            {/* Row 1: Column names */}
            <tr>
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
            {loading ? (
              <tr>
                <td colSpan={NUTRIENT_COLUMNS.length + 3} className="loading-cell">
                  불러오는 중...
                </td>
              </tr>
            ) : parsedRows.length === 0 ? (
              <tr>
                <td colSpan={NUTRIENT_COLUMNS.length + 3} className="loading-cell">
                  검색 결과가 없습니다
                </td>
              </tr>
            ) : parsedRows.map((row, i) => (
              <tr key={i}>
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
    </div>
  )
}
