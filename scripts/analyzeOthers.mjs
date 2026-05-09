// 일회성 분석용: parseStdrStnd 로 파싱했을 때 매칭되지 않고 others 로 빠진
// 영양소들의 빈도를 집계.
// parseStdrStnd 로직과 NUTRIENT_COLUMNS aliases 를 inline 으로 복사 (src 의 .js
// import 경로 이슈 회피). 필요 시 src 코드와 동기화.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IN_FILE = path.join(__dirname, 'multivitamin-data.json')
const OUT_FILE = path.join(__dirname, 'others-list.txt')
const SAMPLE_FILE = path.join(__dirname, 'others-samples.txt')

// ─── nutrients.js inline copy ───
const NUTRIENT_COLUMNS = [
  { key: 'vitA',        name: '비타민A',    aliases: ['비타민A', '비타민 A'] },
  { key: 'vitB1',       name: '비타민B1',   aliases: ['비타민B1', '비타민 B1', '티아민'] },
  { key: 'vitB2',       name: '비타민B2',   aliases: ['비타민B2', '비타민 B2', '리보플라빈'] },
  { key: 'vitB6',       name: '비타민B6',   aliases: ['비타민B6', '비타민 B6', '피리독신'] },
  { key: 'vitB12',      name: '비타민B12',  aliases: ['비타민B12', '비타민 B12', '시아노코발라민'] },
  { key: 'vitC',        name: '비타민C',    aliases: ['비타민C', '비타민 C', '아스코르브산'] },
  { key: 'vitD',        name: '비타민D',    aliases: ['비타민D', '비타민 D', '비타민D3', '비타민 D3', '비타민D2', '비타민 D2', '콜레칼시페롤', '에르고칼시페롤'] },
  { key: 'vitE',        name: '비타민E',    aliases: ['비타민E', '비타민 E', '토코페롤'] },
  { key: 'vitK',        name: '비타민K',    aliases: ['비타민K', '비타민 K'] },
  { key: 'niacin',      name: '나이아신',   aliases: ['나이아신', '니아신', '나이아신아마이드', '니코틴산아미드', '니코틴아미드', '비타민B3', '비타민 B3'] },
  { key: 'folate',      name: '엽산',       aliases: ['엽산', '폴산', '폴레이트', '비타민B9', '비타민 B9'] },
  { key: 'pantothenic', name: '판토텐산',   aliases: ['판토텐산', '판토텐', '비타민B5', '비타민 B5'] },
  { key: 'biotin',      name: '비오틴',     aliases: ['비오틴', '비타민B7', '비타민 B7', '비타민H'] },
  { key: 'calcium',     name: '칼슘',       aliases: ['칼슘'] },
  { key: 'iron',        name: '철',         aliases: ['철', '철분'] },
  { key: 'zinc',        name: '아연',       aliases: ['아연'] },
  { key: 'copper',      name: '구리',       aliases: ['구리'] },
  { key: 'magnesium',   name: '마그네슘',   aliases: ['마그네슘'] },
  { key: 'manganese',   name: '망간',       aliases: ['망간'] },
  { key: 'selenium',    name: '셀레늄',     aliases: ['셀레늄', '셀렌'] },
  { key: 'iodine',      name: '요오드',     aliases: ['요오드'] },
  { key: 'molybdenum',  name: '몰리브덴',   aliases: ['몰리브덴'] },
  { key: 'potassium',   name: '칼륨',       aliases: ['칼륨'] },
  { key: 'phosphorus',  name: '인',         aliases: ['인'] },
  { key: 'chromium',    name: '크롬',       aliases: ['크롬'] },
]

// ─── parseStdrStnd.js inline copy ───
function normalize(name) {
  return name.replace(/\s+/g, '').trim().toLowerCase()
}

function findNutrient(name) {
  const cleaned = name.replace(/\s*함량.*$/, '').replace(/^최종제품\s*-?\s*/, '').trim()
  const norm = normalize(cleaned)
  const exact = NUTRIENT_COLUMNS.find(n => n.aliases.some(a => normalize(a) === norm))
  if (exact) return exact
  const withoutParen = normalize(cleaned.replace(/\([^)]*\)/g, ''))
  if (withoutParen !== norm) {
    const found = NUTRIENT_COLUMNS.find(n => n.aliases.some(a => normalize(a) === withoutParen))
    if (found) return found
  }
  const parenMatch = cleaned.match(/\(([^)]+)\)/)
  if (parenMatch) {
    const inside = normalize(parenMatch[1].replace(/또는\s*/g, ''))
    const found = NUTRIENT_COLUMNS.find(n => n.aliases.some(a => normalize(a) === inside))
    if (found) return found
  }
  return null
}

const SKIP_PATTERNS = [
  /성\s*상/, /대장\s*균/, /붕\s*해/, /납/, /카드뮴/, /수은/, /비소/,
  /세\s*균\s*수/, /진\s*균\s*수/, /총\s*균\s*수/, /살모넬라/,
  /잔류용매/, /헥산/, /초산에틸/, /아세톤/, /이소프로필/,
]
function shouldSkip(line) {
  return SKIP_PATTERNS.some(p => p.test(line))
}

function addResult(result, name, amount) {
  if (isNaN(amount)) return false
  const nutrient = findNutrient(name)
  if (nutrient) {
    result.nutrients[nutrient.key] = (result.nutrients[nutrient.key] || 0) + amount
    return true
  }
  return false
}
function addOther(result, name, amount, unit) {
  const displayName = name.replace(/의\s*합$/, '').trim()
  result.others.push(displayName)  // ★ 빈도 집계 위해 이름만 저장
}

function parseStdrStnd(text) {
  const result = { nutrients: {}, others: [] }
  if (!text) return result
  const lines = text.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (/^\[.*\]$/.test(line)) continue
    if (/^\[.*[–\-].*\]$/.test(line)) continue
    if (shouldSkip(line)) continue
    const stripRe = /^(?:\d+\.\s*|\(?\d+\)?\s*|\d+\)\s*|[①-⑳㉑-㉟⑴-⒇]\s*|-\s*|■\s*|:\s*|\.\s*|,\s*|\?\s*|[ㆍ⦁・·]\s*)/
    let cleaned = line
    let prev
    do { prev = cleaned; cleaned = cleaned.replace(stripRe, '') } while (cleaned !== prev)
    if (/^성\s*상\s*:/.test(cleaned)) continue
    let matched = false

    if (!matched) {
      const m = cleaned.match(/(.+?)\s*:\s*표시[량랑]\s*\(\s*([\d,\.]+)\s*([^\/\)]*)/)
      if (m) {
        const name = m[1].replace(/최종제품\s*-?\s*/, '').trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        if (!isNaN(amount)) { if (!addResult(result, name, amount)) addOther(result, name, amount, m[3].trim()); matched = true }
      }
    }
    if (!matched) {
      const m = cleaned.match(/(.+?)\s*:\s*\(\s*표시[량랑]\s*:\s*([\d,\.]+)\s*([^\/\)]*)/)
      if (m) {
        const name = m[1].trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        if (!isNaN(amount)) { if (!addResult(result, name, amount)) addOther(result, name, amount, m[3].trim()); matched = true }
      }
    }
    if (!matched) {
      const m = cleaned.match(/(.+?)\s*:\s*.*표시[량랑]의\s*[\d\s~～\-%]+.*\(\s*표시[량랑]\s*:?\s*([\d,\.]+)\s*([^\/\)]*)/)
      if (m) {
        const name = m[1].replace(/최종제품\s*-?\s*/, '').trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        if (!isNaN(amount)) { if (!addResult(result, name, amount)) addOther(result, name, amount, m[3].trim()); matched = true }
      }
    }
    if (!matched) {
      const m = cleaned.match(/(.+?)\s*:\s*표시[량랑]\s+([\d,\.]+)\s*([^\/\s]*)/)
      if (m) {
        const name = m[1].trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        if (!isNaN(amount)) { if (!addResult(result, name, amount)) addOther(result, name, amount, m[3].trim()); matched = true }
      }
    }
    if (!matched) {
      const m = cleaned.match(/(.+?)\s*\(\s*표시[량랑]\s*:?\s*([\d,\.]+)\s*([^\/\)]*)/)
      if (m) {
        const name = m[1].trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        if (!isNaN(amount)) { if (!addResult(result, name, amount)) addOther(result, name, amount, m[3].trim()); matched = true }
      }
    }
    if (!matched) {
      const m = cleaned.match(/(.+?)\s+표시[량랑]\s*\(\s*([\d,\.]+)\s*([^\/\)]*)/)
      if (m) {
        const name = m[1].trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        if (!isNaN(amount)) { if (!addResult(result, name, amount)) addOther(result, name, amount, m[3].trim()); matched = true }
      }
    }
    if (!matched) {
      const m = cleaned.match(/(.+?)\s*:\s*([\d,\.]+)\s*(\S+)/)
      if (m) {
        const name = m[1].trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        if (!isNaN(amount) && !shouldSkip(line)) {
          if (!addResult(result, name, amount)) addOther(result, name, amount, m[3].trim())
          matched = true
        }
      }
    }
  }
  return result
}

// ─── 분석 ───
const data = JSON.parse(await fs.readFile(IN_FILE, 'utf-8'))
const otherCounts = new Map()  // name -> count
const otherSamples = new Map() // name -> [productName, ...] (최대 3개)
let totalProducts = 0
let totalNutrients = 0
let totalOthers = 0

for (const row of data.rows) {
  totalProducts++
  const result = parseStdrStnd(row.STDR_STND)
  totalNutrients += Object.keys(result.nutrients).length
  for (const name of result.others) {
    otherCounts.set(name, (otherCounts.get(name) || 0) + 1)
    if (!otherSamples.has(name)) otherSamples.set(name, [])
    const samples = otherSamples.get(name)
    if (samples.length < 3) samples.push(row.PRDLST_NM)
    totalOthers++
  }
}

const sorted = Array.from(otherCounts.entries()).sort((a, b) => b[1] - a[1])

console.log(`Products analyzed: ${totalProducts}`)
console.log(`Total nutrient matches: ${totalNutrients} (avg ${(totalNutrients / totalProducts).toFixed(2)} per product)`)
console.log(`Total others: ${totalOthers} (avg ${(totalOthers / totalProducts).toFixed(2)} per product)`)
console.log(`Unique others: ${sorted.length}`)
console.log('---')
console.log('Top 80 others by frequency:')
for (const [name, count] of sorted.slice(0, 80)) {
  console.log(`  ${String(count).padStart(4)}  ${name}`)
}

await fs.writeFile(OUT_FILE, sorted.map(([n, c]) => `${c}\t${n}`).join('\n'))
await fs.writeFile(SAMPLE_FILE,
  sorted.map(([n, c]) => `[${c}] ${n}\n  → ${(otherSamples.get(n) || []).join(' | ')}`).join('\n\n')
)
console.log('---')
console.log(`Full list: ${OUT_FILE}`)
console.log(`Samples:   ${SAMPLE_FILE}`)
