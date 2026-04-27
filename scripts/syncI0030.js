// scripts/syncI0030.js
// 식약처 I0030 (건강기능식품 품목제조 신고사항 현황) 전체 데이터를 받아
// public/data/i0030.json 으로 저장. 빌드/커밋해서 모든 사용자에게 배포.
//
// 실행: node scripts/syncI0030.js
// 환경변수: VITE_API_KEY (없으면 .env.local 에서 자동 로드)

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_FILE = path.join(ROOT, 'public', 'data', 'i0030.json')

const PAGE_SIZE = 1000 // I0030 supports up to 1000 per call (보통)
const ENDPOINT = 'I0030'
const CONCURRENCY = 3
const SLEEP_MS = 200 // rate-limit safety

// C003 에 이미 있는 필드는 제외하고, 신규 필드만 저장 (용량 절약)
const KEY_FIELD = 'PRDLST_REPORT_NO'
const VALUE_FIELDS = [
  'FRMLC_MTRQLT',     // 포장재질
  'FRMLC_MTHD',       // 포장방법
  'INDIV_RAWMTRL_NM', // 기능성 원재료
  'ETC_RAWMTRL_NM',   // 기타 원재료
  'CAP_RAWMTRL_NM',   // 캡슐 원재료
]

async function loadEnvKey() {
  if (process.env.VITE_API_KEY) return process.env.VITE_API_KEY
  try {
    const txt = await fs.readFile(path.join(ROOT, '.env.local'), 'utf-8')
    const m = txt.match(/VITE_API_KEY\s*=\s*([^\s\n]+)/)
    if (m) return m[1]
  } catch {/* ignore */}
  throw new Error('VITE_API_KEY not found in env or .env.local')
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchPage(apiKey, startIdx, endIdx, attempt = 1) {
  const url = `http://openapi.foodsafetykorea.go.kr/api/${apiKey}/${ENDPOINT}/json/${startIdx}/${endIdx}`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const body = data?.[ENDPOINT]
    if (!body) throw new Error('Missing endpoint body')
    if (body.RESULT?.CODE && body.RESULT.CODE !== 'INFO-000') {
      throw new Error(`API ${body.RESULT.CODE}: ${body.RESULT.MSG}`)
    }
    return {
      total: parseInt(body.total_count) || 0,
      rows: body.row || [],
    }
  } catch (e) {
    if (attempt < 3) {
      console.warn(`  retry ${startIdx}-${endIdx} (${e.message})`)
      await sleep(1000 * attempt)
      return fetchPage(apiKey, startIdx, endIdx, attempt + 1)
    }
    throw e
  }
}

function pickFields(row) {
  const out = {}
  for (const f of VALUE_FIELDS) {
    if (row[f]) out[f] = row[f]
  }
  return out
}

async function main() {
  const apiKey = await loadEnvKey()
  console.log(`[sync] API key loaded (${apiKey.slice(0, 4)}...)`)

  // 1. Total count 확인
  const first = await fetchPage(apiKey, 1, 1)
  const total = first.total
  console.log(`[sync] total_count = ${total}`)

  // 2. 페이지 범위 계산
  const ranges = []
  for (let s = 1; s <= total; s += PAGE_SIZE) {
    ranges.push([s, Math.min(s + PAGE_SIZE - 1, total)])
  }
  console.log(`[sync] ${ranges.length} pages × ${PAGE_SIZE} each`)

  // 3. 동시성 제한된 순차 fetch
  const dict = {}
  let done = 0
  let totalRows = 0
  const startTime = Date.now()

  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(([s, e]) => fetchPage(apiKey, s, e))
    )
    for (const r of results) {
      for (const row of r.rows) {
        totalRows++
        const key = row[KEY_FIELD]
        if (!key) continue
        const v = pickFields(row)
        if (Object.keys(v).length > 0) dict[key] = v
      }
    }
    done += batch.length
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
    const eta = ((Date.now() - startTime) / done * (ranges.length - done) / 1000).toFixed(0)
    process.stdout.write(`\r[sync] ${done}/${ranges.length} pages | ${totalRows} rows | ${Object.keys(dict).length} kept | ${elapsed}s | ~${eta}s remaining`)
    if (i + CONCURRENCY < ranges.length) await sleep(SLEEP_MS)
  }
  console.log('')

  // 4. 파일 저장: { [PRDLST_REPORT_NO]: { 5개 필드, 키 자체는 값에서 제외 } }
  const payload = {
    syncedAt: new Date().toISOString(),
    total,
    count: Object.keys(dict).length,
    data: dict,
  }
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })
  await fs.writeFile(OUT_FILE, JSON.stringify(payload))
  const stat = await fs.stat(OUT_FILE)
  console.log(`[sync] saved ${OUT_FILE}`)
  console.log(`[sync] ${(stat.size / 1024 / 1024).toFixed(2)} MB | ${payload.count} products with packaging data`)
}

main().catch(err => {
  console.error('[sync] FAILED:', err)
  process.exit(1)
})
