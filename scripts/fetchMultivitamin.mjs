// 일회성 분석용: "멀티비타민" 검색 결과 전체를 라이브 프록시에서 받아 저장.
// 실행: node scripts/fetchMultivitamin.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(__dirname, 'multivitamin-data.json')

const PROXY = 'https://hff-tracker.vercel.app/api/proxy'
const KEYWORD = '멀티비타민'
const PAGE_SIZE = 100

async function fetchPage(start, end) {
  const url = `${PROXY}?endpoint=C003&startIdx=${start}&endIdx=${end}&filterField=PRDLST_NM&filterValue=${encodeURIComponent(KEYWORD)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

let all = []
let total = null
let page = 1
while (true) {
  const start = (page - 1) * PAGE_SIZE + 1
  const end = start + PAGE_SIZE - 1
  const data = await fetchPage(start, end)
  if (total === null) total = parseInt(data.total_count) || 0
  if (!data.row || data.row.length === 0) break
  all = all.concat(data.row)
  console.log(`page ${page}: ${all.length}/${total}`)
  if (all.length >= total) break
  page++
  await new Promise(r => setTimeout(r, 100))
}

await fs.writeFile(OUT_FILE, JSON.stringify({ total, count: all.length, rows: all }, null, 2))
console.log(`saved ${all.length} rows to ${OUT_FILE}`)
