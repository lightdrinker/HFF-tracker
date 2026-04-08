import { useState, useEffect, useMemo } from 'react'
import { fetchAll } from '../api/fetchAll'
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
  const [rawData, setRawData] = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('all')
  const [selectedOptional, setSelectedOptional] = useState([])
  const [page, setPage] = useState(1)

  useEffect(() => {
    setRawData([])
    setLoaded(false)
    setSearch('')
    setPeriod('all')
    setSelectedOptional([])
    setPage(1)
  }, [tab.id])

  async function loadData() {
    setLoading(true)
    const items = await fetchAll(tab.id)
    setRawData(items)
    setLoaded(true)
    setLoading(false)
  }

  const activeColumns = useMemo(() => {
    const optional = tab.optionalColumns.filter(c => selectedOptional.includes(c.key))
    return [...tab.fixedColumns, ...optional]
  }, [tab, selectedOptional])

  const filteredData = useMemo(() => {
    if (!loaded) return []
    let items = rawData
    items = filterByPeriod(items, tab.dateField, period)
    items = filterBySearch(items, search, tab.searchFields)
    const hasSplit = selectedOptional.includes('RAWMTRL_NM') &&
      tab.optionalColumns.find(c => c.key === 'RAWMTRL_NM')?.splitRows
    if (hasSplit) items = expandByIngredient(items)
    return items
  }, [rawData, loaded, search, period, selectedOptional, tab])

  const newCount = useMemo(() => {
    if (!tab.dateField) return 0
    return filteredData.filter(item => isNew(item[tab.dateField])).length
  }, [filteredData, tab.dateField])

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE)
  const pageData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleOptional(key) {
    setSelectedOptional(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
    setPage(1)
  }

  function handleSearch(e) {
    setSearch(e.target.value)
    setPage(1)
  }

  function handlePeriod(v) {
    setPeriod(v)
    setPage(1)
  }

  function handleExport() {
    exportToExcel(filteredData, activeColumns, tab.label)
  }

  return (
    <div className="tab-view">
      {/* Description */}
      <div className="description-box">
        <ul>
          {tab.description.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      </div>

      {/* Load button */}
      {!loaded && (
        <div className="load-section">
          <button className="btn-primary" onClick={loadData} disabled={loading}>
            {loading ? '불러오는 중...' : '데이터 불러오기'}
          </button>
          {loading && <span className="loading-hint">전체 데이터를 가져오는 중입니다. 잠시만 기다려주세요.</span>}
        </div>
      )}

      {loaded && (
        <>
          {/* Stats bar */}
          <div className="stats-bar">
            <span className="total-count">총 {filteredData.length.toLocaleString()}건</span>
            {newCount > 0 && (
              <span className="new-badge">🆕 30일 내 신규 {newCount.toLocaleString()}건</span>
            )}
          </div>

          {/* Filters */}
          <div className="filter-row">
            {tab.dateField && (
              <div className="period-filter">
                {PERIOD_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`period-btn ${period === opt.value ? 'active' : ''}`}
                    onClick={() => handlePeriod(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            <input
              className="search-input"
              type="text"
              placeholder="키워드 검색 (제품명, 업체명, 기능성, 원재료...)"
              value={search}
              onChange={handleSearch}
            />
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
            <button className="btn-export" onClick={handleExport}>
              📥 엑셀 추출 ({filteredData.length.toLocaleString()}건)
            </button>
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
                {pageData.map((row, i) => (
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
              <button onClick={() => setPage(1)} disabled={page === 1}>{'«'}</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>{'‹'}</button>
              <span>{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{'›'}</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}>{'»'}</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
