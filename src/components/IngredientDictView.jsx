import { useState, useEffect, useMemo, useCallback } from 'react'
import { loadAllIngredients } from '../utils/mergeIngredients'
import { INGREDIENT_COLUMNS, TYPE_OPTIONS } from '../config/ingredientColumns'
import { exportToExcel } from '../utils/excel'

const PAGE_SIZE = 20

export default function IngredientDictView({ tab }) {
  const [allData, setAllData] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadMsg, setLoadMsg] = useState('원료 데이터 로딩 중...')

  // Filters
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Columns
  const [activeKeys, setActiveKeys] = useState(() =>
    INGREDIENT_COLUMNS.filter(c => c.defaultOn).map(c => c.key)
  )

  // Column swap animation
  const [swapping, setSwapping] = useState(null)

  // Load all 3 APIs on mount
  useEffect(() => {
    setLoading(true)
    loadAllIngredients((msg) => setLoadMsg(msg))
      .then(data => {
        setAllData(data)
        setLoading(false)
      })
      .catch(() => {
        setLoadMsg('데이터 로딩 실패')
        setLoading(false)
      })
  }, [])

  // Filter data
  const filtered = useMemo(() => {
    let items = allData
    if (typeFilter !== 'all') {
      const typeLabel = typeFilter === 'notified' ? '고시형' : '개별인정'
      items = items.filter(item => item.type === typeLabel)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      items = items.filter(item =>
        item.name.toLowerCase().includes(q) ||
        item.fnclty.toLowerCase().includes(q) ||
        item.company.toLowerCase().includes(q)
      )
    }
    return items
  }, [allData, typeFilter, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Column helpers
  const activeColumns = useMemo(() =>
    activeKeys.map(key => INGREDIENT_COLUMNS.find(c => c.key === key)).filter(Boolean),
    [activeKeys]
  )
  const inactiveColumns = useMemo(() =>
    INGREDIENT_COLUMNS.filter(c => !activeKeys.includes(c.key)),
    [activeKeys]
  )

  function addColumn(key) { setActiveKeys(prev => [...prev, key]) }
  function removeColumn(key) { setActiveKeys(prev => prev.filter(k => k !== key)) }

  function moveColumn(key, dir) {
    const idx = activeKeys.indexOf(key)
    if (idx < 0) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= activeKeys.length) return
    const otherKey = activeKeys[newIdx]
    setSwapping({ a: key, b: otherKey, dir })
    setTimeout(() => {
      setActiveKeys(prev => {
        const next = [...prev]
        ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
        return next
      })
      setSwapping(null)
    }, 300)
  }

  function getSwapStyle(key) {
    if (!swapping) return {}
    if (key === swapping.a) return { transform: `translateX(${swapping.dir * 100}%)`, transition: 'transform 0.3s ease' }
    if (key === swapping.b) return { transform: `translateX(${-swapping.dir * 100}%)`, transition: 'transform 0.3s ease' }
    return {}
  }

  // Export
  function handleExport() {
    const cols = activeColumns.map(c => ({ key: c.key, label: c.label }))
    exportToExcel(filtered, cols, '원료사전')
  }

  return (
    <div className="tab-view">
      {/* Description */}
      <div className="description-box">
        <ul>
          {tab.description.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      </div>

      {/* Type filter + search */}
      <div className="filter-row">
        <div className="period-filter">
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`period-btn ${typeFilter === opt.value ? 'active' : ''}`}
              onClick={() => { setTypeFilter(opt.value); setPage(1) }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          type="text"
          placeholder="키워드 검색 (원료명, 기능성, 업체명)"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {/* Stats */}
      <div className="stats-bar">
        <span className="total-count">
          {loading ? loadMsg : `총 ${filtered.length.toLocaleString()}건`}
        </span>
      </div>

      {/* Column selector */}
      <div className="column-selector">
        <div className="column-active">
          <span className="col-section-label">확정 컬럼 <span className="col-hint">( ‹ › 화살표로 엑셀 컬럼 순서 변경 )</span></span>
          <div className="col-tags">
            {activeColumns.map((c, idx) => (
              <span key={c.key} className="col-tag-group" style={getSwapStyle(c.key)}>
                {idx > 0 && (
                  <button className="col-move" onClick={() => moveColumn(c.key, -1)} disabled={!!swapping} title="왼쪽으로">‹</button>
                )}
                <button
                  className="col-tag active"
                  onClick={() => removeColumn(c.key)}
                  title={c.desc || c.label}
                >
                  {c.label} ✕
                </button>
                {idx < activeKeys.length - 1 && (
                  <button className="col-move" onClick={() => moveColumn(c.key, 1)} disabled={!!swapping} title="오른쪽으로">›</button>
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
                  + {c.label}{c.typeTag ? ` [${c.typeTag}]` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Export */}
      <div className="export-row">
        <button className="btn-export" onClick={handleExport} disabled={loading || activeKeys.length === 0}>
          엑셀 추출 ({filtered.length.toLocaleString()}건)
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="empty-msg">{loadMsg}</div>
      ) : activeKeys.length === 0 ? (
        <div className="empty-msg">확정 컬럼을 1개 이상 선택해주세요</div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                {activeColumns.map(c => <th key={c.key}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr><td colSpan={activeColumns.length} className="loading-cell">검색 결과가 없습니다</td></tr>
              ) : pageData.map((row, i) => (
                <tr key={i}>
                  {activeColumns.map(c => (
                    <td key={c.key} title={row[c.key] || ''}>
                      {c.key === 'type' ? (
                        <span className={`type-badge ${row.type === '고시형' ? 'notified' : 'individual'}`}>
                          {row.type}
                        </span>
                      ) : (
                        <>
                          {(row[c.key] || '').slice(0, 100)}
                          {(row[c.key] || '').length > 100 ? '...' : ''}
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setPage(1)} disabled={page === 1}>{'«'}</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>{'‹'}</button>
          <span>{page} / {totalPages.toLocaleString()}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{'›'}</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages}>{'»'}</button>
        </div>
      )}
    </div>
  )
}
