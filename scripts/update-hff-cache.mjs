import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_FILE = path.join(ROOT, 'public', 'hff-cache.json')

const API_BASE = 'http://openapi.foodsafetykorea.go.kr/api'
const PAGE_SIZE = Number(process.env.HFF_CACHE_PAGE_SIZE || 1000)
const CONCURRENCY = Number(process.env.HFF_CACHE_CONCURRENCY || 3)
const SLEEP_MS = Number(process.env.HFF_CACHE_SLEEP_MS || 200)

const C003_ENDPOINT = 'C003'
const I0030_ENDPOINT = 'I0030'
const INGREDIENT_ENDPOINTS = ['I2710', 'I-0040', 'I-0050']

const I0030_KEY_FIELD = 'PRDLST_REPORT_NO'
const I0030_VALUE_FIELDS = [
  'FRMLC_MTRQLT',
  'FRMLC_MTHD',
  'INDIV_RAWMTRL_NM',
  'ETC_RAWMTRL_NM',
  'CAP_RAWMTRL_NM',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function loadDotEnvKey(fileName) {
  try {
    const txt = await fs.readFile(path.join(ROOT, fileName), 'utf8')
    const match = txt.match(/(?:HFF_API_KEY|VITE_API_KEY)\s*=\s*([^\s\n]+)/)
    return match?.[1]
  } catch {
    return null
  }
}

async function loadApiKey() {
  const key = process.env.HFF_API_KEY || process.env.VITE_API_KEY
  if (key) return key

  const localKey = await loadDotEnvKey('.env.local') || await loadDotEnvKey('.env')
  if (localKey) return localKey

  throw new Error('HFF_API_KEY or VITE_API_KEY is required')
}

function getEndpointBody(data, endpoint) {
  return data?.[endpoint] || data
}

function getRows(body) {
  if (!body?.row) return []
  return Array.isArray(body.row) ? body.row : [body.row]
}

async function fetchPage(apiKey, endpoint, startIdx, endIdx, attempt = 1) {
  const url = `${API_BASE}/${apiKey}/${endpoint}/json/${startIdx}/${endIdx}`

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const body = getEndpointBody(data, endpoint)
    if (!body) throw new Error(`Missing ${endpoint} body`)

    const code = body.RESULT?.CODE
    if (code && code !== 'INFO-000') {
      throw new Error(`API ${code}: ${body.RESULT?.MSG || 'unknown error'}`)
    }

    return {
      totalCount: Number(body.total_count || 0),
      rows: getRows(body),
    }
  } catch (error) {
    if (attempt < 3) {
      console.warn(`[cache] retry ${endpoint} ${startIdx}-${endIdx}: ${error.message}`)
      await sleep(1000 * attempt)
      return fetchPage(apiKey, endpoint, startIdx, endIdx, attempt + 1)
    }
    throw error
  }
}

async function fetchEndpoint(apiKey, endpoint) {
  const first = await fetchPage(apiKey, endpoint, 1, 1)
  const totalCount = first.totalCount
  const ranges = []

  for (let start = 1; start <= totalCount; start += PAGE_SIZE) {
    ranges.push([start, Math.min(start + PAGE_SIZE - 1, totalCount)])
  }

  console.log(`[cache] ${endpoint}: ${totalCount} rows across ${ranges.length} pages`)

  const items = []
  const startedAt = Date.now()

  for (let index = 0; index < ranges.length; index += CONCURRENCY) {
    const batch = ranges.slice(index, index + CONCURRENCY)
    const results = await Promise.all(
      batch.map(([start, end]) => fetchPage(apiKey, endpoint, start, end)),
    )

    for (const result of results) {
      items.push(...result.rows)
    }

    const done = Math.min(index + CONCURRENCY, ranges.length)
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0)
    process.stdout.write(`\r[cache] ${endpoint}: ${done}/${ranges.length} pages, ${items.length}/${totalCount} rows, ${elapsed}s`)

    if (index + CONCURRENCY < ranges.length) await sleep(SLEEP_MS)
  }

  console.log('')
  return { totalCount, items }
}

function buildI0030Map(rows) {
  const map = new Map()

  for (const row of rows) {
    const key = row[I0030_KEY_FIELD]
    if (!key) continue

    const extra = {}
    for (const field of I0030_VALUE_FIELDS) {
      if (row[field]) extra[field] = row[field]
    }

    if (Object.keys(extra).length > 0) {
      map.set(key, extra)
    }
  }

  return map
}

function mergeC003Rows(rows, i0030Map) {
  return rows.map((row) => {
    const extra = i0030Map.get(row.PRDLST_REPORT_NO)
    return extra ? { ...row, ...extra } : row
  })
}

function endpointPayload(totalCount, items) {
  return {
    totalCount,
    itemCount: items.length,
    items,
  }
}

async function main() {
  const apiKey = await loadApiKey()
  const generatedAt = new Date().toISOString()

  console.log('[cache] fetching I0030 supplement fields')
  const i0030 = await fetchEndpoint(apiKey, I0030_ENDPOINT)
  const i0030Map = buildI0030Map(i0030.items)

  console.log('[cache] fetching C003 product rows')
  const c003 = await fetchEndpoint(apiKey, C003_ENDPOINT)
  const mergedC003 = mergeC003Rows(c003.items, i0030Map)

  const endpoints = {
    [C003_ENDPOINT]: endpointPayload(c003.totalCount, mergedC003),
  }

  for (const endpoint of INGREDIENT_ENDPOINTS) {
    console.log(`[cache] fetching ${endpoint} ingredient rows`)
    const result = await fetchEndpoint(apiKey, endpoint)
    endpoints[endpoint] = endpointPayload(result.totalCount, result.items)
  }

  const payload = {
    schemaVersion: 1,
    generatedAt,
    source: {
      baseUrl: API_BASE,
      pageSize: PAGE_SIZE,
    },
    supplements: {
      [I0030_ENDPOINT]: {
        totalCount: i0030.totalCount,
        matchedItemCount: i0030Map.size,
        mergedFields: I0030_VALUE_FIELDS,
      },
    },
    endpoints,
  }

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })
  await fs.writeFile(OUT_FILE, JSON.stringify(payload))

  const stat = await fs.stat(OUT_FILE)
  console.log(`[cache] wrote ${OUT_FILE}`)
  console.log(`[cache] ${(stat.size / 1024 / 1024).toFixed(2)} MB`)
}

main().catch((error) => {
  console.error('[cache] FAILED:', error)
  process.exit(1)
})
