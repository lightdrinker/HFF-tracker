import { NUTRIENT_COLUMNS } from '../config/nutrients'

// STDR_STND 필드에서 성분명과 함량을 추출
// 예: "비타민A : 표시량(1,159 ug RAE/3,210 mg)의 80~150%"
// 예: "EPA와 DHA의 합 : 표시량(600 mg/3,210 mg)의 80~120%"
// 예: "실리마린 : 표시량(130 mg/3,210 mg)의 80~120%"

function normalize(name) {
  return name.replace(/\s+/g, '').trim()
}

function findNutrient(name) {
  const norm = normalize(name)
  return NUTRIENT_COLUMNS.find(n =>
    n.aliases.some(a => normalize(a) === norm)
  )
}

// 불필요한 라인 판별 (성상, 대장균, 납, 붕해 등)
const SKIP_PATTERNS = [
  /성상/, /대장균/, /붕해/, /납/, /카드뮴/, /수은/, /비소/,
  /세균수/, /진균수/, /총균수/, /살모넬라/,
]

function shouldSkip(line) {
  return SKIP_PATTERNS.some(p => p.test(line))
}

export function parseStdrStnd(text) {
  const result = {
    nutrients: {},  // key -> numeric amount
    others: [],     // ["EPA+DHA 600mg", "실리마린 130mg"]
  }

  if (!text) return result

  // 여러 섹션으로 나뉠 수 있음 (예: [MVM정제], [오메가3캡슐])
  // 줄 단위로 파싱
  const lines = text.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('[') && line.endsWith(']')) continue // 섹션 헤더 스킵
    if (/^\d+\)\s*성상/.test(line)) continue // 성상 라인 스킵
    if (shouldSkip(line)) continue

    // "번호) 성분명 : 표시량(숫자 단위/...)의 ..." 패턴
    const match = line.match(
      /(?:\d+\)\s*)?(.+?)\s*:\s*표시량\s*\(\s*([\d,\.]+)\s*([^\/\)]*)/
    )

    if (match) {
      const name = match[1].trim()
      const amount = parseFloat(match[2].replace(/,/g, ''))
      const unit = match[3].trim()

      if (isNaN(amount)) continue

      const nutrient = findNutrient(name)
      if (nutrient) {
        // 같은 성분이 여러 섹션에 있으면 합산
        result.nutrients[nutrient.key] = (result.nutrients[nutrient.key] || 0) + amount
      } else {
        // 25개 영양성분에 해당하지 않는 기능성 원료
        const displayName = name.replace(/의\s*합$/, '').trim()
        result.others.push(`${displayName} ${amount}${unit}`)
      }
      continue
    }

    // 표시량 패턴이 아닌 경우: "성분명 : 숫자 단위 이상" 등
    const match2 = line.match(
      /(?:\d+\)\s*)?(.+?)\s*:\s*([\d,\.]+)\s*(\S+)/
    )
    if (match2) {
      const name = match2[1].trim()
      const amount = parseFloat(match2[2].replace(/,/g, ''))
      const unit = match2[3].trim()

      if (isNaN(amount)) continue
      if (shouldSkip(line)) continue

      const nutrient = findNutrient(name)
      if (nutrient) {
        result.nutrients[nutrient.key] = (result.nutrients[nutrient.key] || 0) + amount
      } else {
        const displayName = name.replace(/의\s*합$/, '').trim()
        result.others.push(`${displayName} ${amount}${unit}`)
      }
    }
  }

  return result
}
