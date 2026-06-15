import fs from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_FILE = path.join(ROOT, 'public', 'hff-cache.json')
const PUBLIC_DIR = path.dirname(OUT_FILE)

const API_BASE = 'https://openapi.foodsafetykorea.go.kr/api'
const PAGE_SIZE = Number(process.env.HFF_CACHE_PAGE_SIZE || 1000)
const CONCURRENCY = Number(process.env.HFF_CACHE_CONCURRENCY || 3)
const SLEEP_MS = Number(process.env.HFF_CACHE_SLEEP_MS || 200)
const MAX_ATTEMPTS = Number(process.env.HFF_CACHE_MAX_ATTEMPTS || 5)
const REQUEST_TIMEOUT_MS = Number(process.env.HFF_CACHE_REQUEST_TIMEOUT_MS || 30000)
const C003_CHUNK_SIZE = Number(process.env.HFF_CACHE_C003_CHUNK_SIZE || 5000)
const C003_CHUNK_PREFIX = 'hff-cache-c003'

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

const C003_FIELDS = [
  'PRDLST_REPORT_NO',
  'PRDLST_NM',
  'BSSH_NM',
  'PRMS_DT',
  'PRDT_SHAP_CD_NM',
  'PRIMARY_FNCLTY',
  'RAWMTRL_NM',
  'NTK_MTHD',
  'IFTKN_ATNT_MATR_CN',
  'POG_DAYCNT',
  'LAST_UPDT_DTM',
  'LCNS_NO',
  'STDR_STND',
  'DISPOS',
  'CSTDY_MTHD',
  'CRET_DTM',
  ...I0030_VALUE_FIELDS,
]

const INGREDIENT_ENDPOINT_FIELDS = {
  I2710: [
    'PRDCT_NM',
    'PRIMARY_FNCLTY',
    'DAY_INTK_LOWLIMIT',
    'DAY_INTK_HIGHLIMIT',
    'INTK_UNIT',
    'IFTKN_ATNT_MATR_CN',
    'SKLL_IX_IRDNT_RAWMTRL',
  ],
  'I-0040': [
    'APLC_RAWMTRL_NM',
    'FNCLTY_CN',
    'DAY_INTK_CN',
    'IFTKN_ATNT_MATR_CN',
    'BSSH_NM',
    'HF_FNCLTY_MTRAL_RCOGN_NO',
    'PRMS_DT',
  ],
  'I-0050': [
    'HF_FNCLTY_MTRAL_RCOGN_NO',
    'DAY_INTK_LOWLIMIT',
    'DAY_INTK_HIGHLIMIT',
    'WT_UNIT',
    'RAWMTRL_NM',
    'PRIMARY_FNCLTY',
    'IFTKN_ATNT_MATR_CN',
  ],
}

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

async function loadAccess() {
  const key = process.env.HFF_API_KEY || process.env.VITE_API_KEY
  if (key) return { apiKey: key, proxyUrl: null }

  const localKey = await loadDotEnvKey('.env.local') || await loadDotEnvKey('.env')
  if (localKey) return { apiKey: localKey, proxyUrl: null }

  const proxyUrl = process.env.HFF_PROXY_URL
  if (proxyUrl) return { apiKey: null, proxyUrl }

  throw new Error('HFF_API_KEY, VITE_API_KEY, or HFF_PROXY_URL is required')
}

function getEndpointBody(data, endpoint) {
  return data?.[endpoint] || data
}

function getRows(body) {
  if (!body?.row) return []
  return Array.isArray(body.row) ? body.row : [body.row]
}

function buildUrl(access, endpoint, startIdx, endIdx) {
  if (access.proxyUrl) {
    const url = new URL(access.proxyUrl)
    url.searchParams.set('endpoint', endpoint)
    url.searchParams.set('startIdx', startIdx)
    url.searchParams.set('endIdx', endIdx)
    return url.toString()
  }

  return `${API_BASE}/${access.apiKey}/${endpoint}/json/${startIdx}/${endIdx}`
}

function requestJson(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const client = parsedUrl.protocol === 'https:' ? https : http
    const req = client.get(
      parsedUrl,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'identity',
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const statusCode = res.statusCode || 0
        const location = res.headers.location

        if (statusCode >= 300 && statusCode < 400 && location && redirectCount < 3) {
          res.resume()
          resolve(requestJson(new URL(location, parsedUrl).toString(), redirectCount + 1))
          return
        }

        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')

          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`HTTP ${statusCode}: ${text.slice(0, 160)}`))
            return
          }

          try {
            resolve(JSON.parse(text))
          } catch (error) {
            reject(new Error(`Invalid JSON: ${error.message}`))
          }
        })
      },
    )

    req.on('timeout', () => {
      req.destroy(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`))
    })
    req.on('error', reject)
  })
}

async function fetchPage(access, endpoint, startIdx, endIdx, attempt = 1) {
  const url = buildUrl(access, endpoint, startIdx, endIdx)

  try {
    const data = await requestJson(url)
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
    if (attempt < MAX_ATTEMPTS) {
      console.warn(`[cache] retry ${endpoint} ${startIdx}-${endIdx}: ${error.message}`)
      await sleep(1000 * attempt)
      return fetchPage(access, endpoint, startIdx, endIdx, attempt + 1)
    }
    throw error
  }
}

async function fetchEndpoint(access, endpoint) {
  const first = await fetchPage(access, endpoint, 1, 1)
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
      batch.map(([start, end]) => fetchPage(access, endpoint, start, end)),
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

function pickRowFields(row, fields) {
  const picked = {}

  for (const field of fields) {
    const value = row[field]
    if (value !== undefined && value !== null && value !== '') {
      picked[field] = value
    }
  }

  return picked
}

async function removeOldChunkFiles() {
  try {
    const files = await fs.readdir(PUBLIC_DIR)
    await Promise.all(
      files
        .filter((file) => file.startsWith(`${C003_CHUNK_PREFIX}-`) && file.endsWith('.json'))
        .map((file) => fs.unlink(path.join(PUBLIC_DIR, file))),
    )
  } catch {
    // public directory may not exist yet
  }
}

async function writeCacheFiles(payload) {
  await fs.mkdir(PUBLIC_DIR, { recursive: true })
  await removeOldChunkFiles()

  const c003 = payload.endpoints[C003_ENDPOINT]
  const c003Items = c003.items || []
  const chunks = []

  if (c003Items.length > C003_CHUNK_SIZE) {
    for (let start = 0; start < c003Items.length; start += C003_CHUNK_SIZE) {
      const part = chunks.length + 1
      const fileName = `${C003_CHUNK_PREFIX}-${String(part).padStart(3, '0')}.json`
      const filePath = path.join(PUBLIC_DIR, fileName)
      const items = c003Items.slice(start, start + C003_CHUNK_SIZE)
      const chunkPayload = {
        endpoint: C003_ENDPOINT,
        generatedAt: payload.generatedAt,
        part,
        itemCount: items.length,
        items,
      }

      await fs.writeFile(filePath, JSON.stringify(chunkPayload))
      const stat = await fs.stat(filePath)
      chunks.push({
        url: `/${fileName}`,
        itemCount: items.length,
        bytes: stat.size,
      })
    }

    delete c003.items
    c003.chunks = chunks
  }

  await fs.writeFile(OUT_FILE, JSON.stringify(payload))
  const manifestStat = await fs.stat(OUT_FILE)

  return {
    manifestBytes: manifestStat.size,
    chunkBytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
    chunkCount: chunks.length,
  }
}

async function main() {
  const access = await loadAccess()
  const generatedAt = new Date().toISOString()
  const accessLabel = access.proxyUrl ? `proxy ${access.proxyUrl}` : 'direct API key'

  console.log(`[cache] using ${accessLabel}`)
  console.log('[cache] fetching I0030 supplement fields')
  const i0030 = await fetchEndpoint(access, I0030_ENDPOINT)
  const i0030Map = buildI0030Map(i0030.items)

  console.log('[cache] fetching C003 product rows')
  const c003 = await fetchEndpoint(access, C003_ENDPOINT)
  const mergedC003 = mergeC003Rows(c003.items, i0030Map)
    .map((row) => pickRowFields(row, C003_FIELDS))

  const endpoints = {
    [C003_ENDPOINT]: endpointPayload(c003.totalCount, mergedC003),
  }

  for (const endpoint of INGREDIENT_ENDPOINTS) {
    console.log(`[cache] fetching ${endpoint} ingredient rows`)
    const result = await fetchEndpoint(access, endpoint)
    const fields = INGREDIENT_ENDPOINT_FIELDS[endpoint]
    const items = fields
      ? result.items.map((row) => pickRowFields(row, fields))
      : result.items
    endpoints[endpoint] = endpointPayload(result.totalCount, items)
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

  const stats = await writeCacheFiles(payload)
  console.log(`[cache] wrote ${OUT_FILE}`)
  console.log(`[cache] manifest ${(stats.manifestBytes / 1024 / 1024).toFixed(2)} MB`)
  if (stats.chunkCount > 0) {
    console.log(`[cache] ${stats.chunkCount} chunks ${(stats.chunkBytes / 1024 / 1024).toFixed(2)} MB`)
  }
}

main().catch((error) => {
  console.error('[cache] FAILED:', error)
  process.exit(1)
})
