import { NUTRIENT_COLUMNS } from '../config/nutrients'

// STDR_STND 필드에서 성분명과 함량을 추출
// 지원 포맷:
//   A: "비타민A : 표시량(700 μg RAE/3,210 mg)의 80~150%"
//   B: "비타민B12 : 96 μg / 23,580mg (표시량의 80~180%)"
//   C: "비타민 C : (표시량: 360mg/12000mg) 80~150%"
//   D: "비타민 A: 표시량의 80~150%(표시량 692μg RE/3,000 mg)"
//   E: "비타민A: 표시량 410.4ugRE/1,800mg의 80~150%"
//   F: "칼슘 표시량(240mg/3200mg)의 80~150%"
//   G: "비타민C(표시량 170mg/4g) : 80이상~150이하(%)"
//   H: "비타민D : 표시량의 80~180% (표시량 : 75 ㎍ / 150 mg)"

function normalize(name) {
  return name.replace(/\s+/g, '').trim()
}

function findNutrient(name) {
  const norm = normalize(name)
  // 1차: 정확 매칭
  const exact = NUTRIENT_COLUMNS.find(n =>
    n.aliases.some(a => normalize(a) === norm)
  )
  if (exact) return exact
  // 2차: 괄호 안 내용 제거 후 매칭 (예: "셀레늄(셀렌)" → "셀레늄")
  const withoutParen = normalize(name.replace(/\([^)]*\)/g, ''))
  if (withoutParen !== norm) {
    const found = NUTRIENT_COLUMNS.find(n =>
      n.aliases.some(a => normalize(a) === withoutParen)
    )
    if (found) return found
  }
  // 3차: 괄호 안 내용으로 매칭 (예: "셀렌(셀레늄)" → "셀레늄")
  const parenMatch = name.match(/\(([^)]+)\)/)
  if (parenMatch) {
    const inside = normalize(parenMatch[1].replace(/또는\s*/g, ''))
    const found = NUTRIENT_COLUMNS.find(n =>
      n.aliases.some(a => normalize(a) === inside)
    )
    if (found) return found
  }
  return null
}

// 불필요한 라인 판별 (성상, 대장균, 납, 붕해 등)
const SKIP_PATTERNS = [
  /성\s*상/, /대장균/, /붕해/, /납/, /카드뮴/, /수은/, /비소/,
  /세균수/, /진균수/, /총균수/, /살모넬라/,
]

function shouldSkip(line) {
  return SKIP_PATTERNS.some(p => p.test(line))
}

// 숫자+단위에서 숫자만 추출
function extractAmount(str) {
  const m = str.match(/([\d,\.]+)/)
  if (!m) return NaN
  return parseFloat(m[1].replace(/,/g, ''))
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
  result.others.push(`${displayName} ${amount}${unit || ''}`)
}

export function parseStdrStnd(text) {
  const result = {
    nutrients: {},
    others: [],
  }

  if (!text) return result

  const lines = text.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (/^\[.*\]$/.test(line)) continue
    if (/^\[.*[–\-].*\]$/.test(line)) continue
    if (shouldSkip(line)) continue

    // 번호 접두사 제거: "2) ", "(2) ", "4. ", "② ", "⑸ " 등
    const cleaned = line.replace(/^(?:\d+\.\s*|\(?\d+\)?\s*|\d+\)\s*|[①-⑳⑴-⒇]\s*)/, '')
    if (/^성\s*상\s*:/.test(cleaned)) continue

    let matched = false

    // 패턴 A: "성분명 : 표시량(숫자 단위/...)의 ..."
    if (!matched) {
      const m = cleaned.match(/(.+?)\s*:\s*표시량\s*\(\s*([\d,\.]+)\s*([^\/\)]*)/);
      if (m) {
        const name = m[1].replace(/최종제품\s*-?\s*/, '').trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        const unit = m[3].trim()
        if (!isNaN(amount)) {
          if (!addResult(result, name, amount)) addOther(result, name, amount, unit)
          matched = true
        }
      }
    }

    // 패턴 C: "성분명 : (표시량: 숫자단위/...)의 ..."
    if (!matched) {
      const m = cleaned.match(/(.+?)\s*:\s*\(표시량\s*:\s*([\d,\.]+)\s*([^\/\)]*)/);
      if (m) {
        const name = m[1].trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        const unit = m[3].trim()
        if (!isNaN(amount)) {
          if (!addResult(result, name, amount)) addOther(result, name, amount, unit)
          matched = true
        }
      }
    }

    // 패턴 D/H: "성분명: 표시량의 80~150%(표시량 692μg RE/3,000 mg)" 또는 "... (표시량 : 75 ㎍ / 150 mg)"
    if (!matched) {
      const m = cleaned.match(/(.+?)\s*:\s*.*표시량의\s*[\d\s~～\-%]+.*\(표시량\s*:?\s*([\d,\.]+)\s*([^\/\)]*)/);
      if (m) {
        const name = m[1].replace(/최종제품\s*-?\s*/, '').trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        const unit = m[3].trim()
        if (!isNaN(amount)) {
          if (!addResult(result, name, amount)) addOther(result, name, amount, unit)
          matched = true
        }
      }
    }

    // 패턴 E: "성분명: 표시량 숫자단위/전체의 ..."  (괄호 없음)
    if (!matched) {
      const m = cleaned.match(/(.+?)\s*:\s*표시량\s+([\d,\.]+)\s*([^\/\s]*)/);
      if (m) {
        const name = m[1].trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        const unit = m[3].trim()
        if (!isNaN(amount)) {
          if (!addResult(result, name, amount)) addOther(result, name, amount, unit)
          matched = true
        }
      }
    }

    // 패턴 G: "성분명(표시량 숫자단위/...) : ..."
    if (!matched) {
      const m = cleaned.match(/(.+?)\s*\(\s*표시량\s*([\d,\.]+)\s*([^\/\)]*)/);
      if (m) {
        const name = m[1].trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        const unit = m[3].trim()
        if (!isNaN(amount)) {
          if (!addResult(result, name, amount)) addOther(result, name, amount, unit)
          matched = true
        }
      }
    }

    // 패턴 F: "성분명 표시량(숫자단위/...)의 ..." (콜론 없음)
    if (!matched) {
      const m = cleaned.match(/(.+?)\s+표시량\s*\(\s*([\d,\.]+)\s*([^\/\)]*)/);
      if (m) {
        const name = m[1].trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        const unit = m[3].trim()
        if (!isNaN(amount)) {
          if (!addResult(result, name, amount)) addOther(result, name, amount, unit)
          matched = true
        }
      }
    }

    // 패턴 B (fallback): "성분명 : 숫자 단위 / ..." (표시량 키워드 없이 직접 값)
    if (!matched) {
      const m = cleaned.match(/(.+?)\s*:\s*([\d,\.]+)\s*(\S+)/)
      if (m) {
        const name = m[1].trim()
        const amount = parseFloat(m[2].replace(/,/g, ''))
        const unit = m[3].trim()
        if (!isNaN(amount) && !shouldSkip(line)) {
          if (!addResult(result, name, amount)) addOther(result, name, amount, unit)
          matched = true
        }
      }
    }
  }

  return result
}
