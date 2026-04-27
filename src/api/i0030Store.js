// I0030 보강 데이터 (포장재질, 포장방법, 분리된 원재료)를
// public/data/i0030.json 에서 로드해 in-memory 조회 제공.
// scripts/syncI0030.js 가 빌드 전에 갱신.

let _loadPromise = null
let _data = null
let _meta = null

const DATA_URL = '/data/i0030.json'

async function load() {
  if (_data) return _data
  if (_loadPromise) return _loadPromise
  _loadPromise = (async () => {
    try {
      const res = await fetch(DATA_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const payload = await res.json()
      _meta = { syncedAt: payload.syncedAt, total: payload.total, count: payload.count }
      _data = payload.data || {}
      return _data
    } catch (e) {
      console.warn('[i0030Store] load failed, packaging fields will be empty:', e.message)
      _data = {}
      _meta = { syncedAt: null, total: 0, count: 0, error: e.message }
      return _data
    }
  })()
  return _loadPromise
}

// 한 행에 I0030 필드 보강
export function mergeRow(row) {
  if (!_data || !row?.PRDLST_REPORT_NO) return row
  const extra = _data[row.PRDLST_REPORT_NO]
  if (!extra) return row
  return { ...row, ...extra }
}

// 여러 행 보강 (load 보장)
export async function mergeRows(rows) {
  await load()
  if (!Array.isArray(rows)) return rows
  return rows.map(mergeRow)
}

// 앱 시작 시 호출 — 미리 로드
export function preload() {
  return load()
}

export function getMeta() {
  return _meta
}
