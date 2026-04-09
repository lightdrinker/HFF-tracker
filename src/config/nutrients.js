// 건강기능식품 영양성분 25종 + RDA 기준치 (식약처 영양소 기준치 기반)
export const NUTRIENT_COLUMNS = [
  { key: 'vitA',        name: '비타민A',    rda: 700,   unit: 'μg RAE',  aliases: ['비타민A', '비타민 A'] },
  { key: 'vitB1',       name: '비타민B1',   rda: 1.2,   unit: 'mg',      aliases: ['비타민B1', '비타민 B1', '티아민'] },
  { key: 'vitB2',       name: '비타민B2',   rda: 1.4,   unit: 'mg',      aliases: ['비타민B2', '비타민 B2', '리보플라빈'] },
  { key: 'vitB6',       name: '비타민B6',   rda: 1.5,   unit: 'mg',      aliases: ['비타민B6', '비타민 B6', '피리독신'] },
  { key: 'vitB12',      name: '비타민B12',  rda: 2.4,   unit: 'μg',      aliases: ['비타민B12', '비타민 B12', '시아노코발라민'] },
  { key: 'vitC',        name: '비타민C',    rda: 100,   unit: 'mg',      aliases: ['비타민C', '비타민 C', '아스코르브산'] },
  { key: 'vitD',        name: '비타민D',    rda: 10,    unit: 'μg',      aliases: ['비타민D', '비타민 D', '콜레칼시페롤'] },
  { key: 'vitE',        name: '비타민E',    rda: 11,    unit: 'mg α-TE', aliases: ['비타민E', '비타민 E', '토코페롤'] },
  { key: 'vitK',        name: '비타민K',    rda: 70,    unit: 'μg',      aliases: ['비타민K', '비타민 K'] },
  { key: 'niacin',      name: '나이아신',   rda: 15,    unit: 'mg NE',   aliases: ['나이아신', '니아신', '나이아신아마이드', '니코틴산아미드'] },
  { key: 'folate',      name: '엽산',       rda: 400,   unit: 'μg DFE',  aliases: ['엽산', '폴산', '폴레이트'] },
  { key: 'pantothenic', name: '판토텐산',   rda: 5,     unit: 'mg',      aliases: ['판토텐산', '판토텐'] },
  { key: 'biotin',      name: '비오틴',     rda: 30,    unit: 'μg',      aliases: ['비오틴'] },
  { key: 'calcium',     name: '칼슘',       rda: 700,   unit: 'mg',      aliases: ['칼슘'] },
  { key: 'iron',        name: '철',         rda: 12,    unit: 'mg',      aliases: ['철', '철분'] },
  { key: 'zinc',        name: '아연',       rda: 8.5,   unit: 'mg',      aliases: ['아연'] },
  { key: 'copper',      name: '구리',       rda: 0.8,   unit: 'mg',      aliases: ['구리'] },
  { key: 'magnesium',   name: '마그네슘',   rda: 315,   unit: 'mg',      aliases: ['마그네슘'] },
  { key: 'manganese',   name: '망간',       rda: 3.5,   unit: 'mg',      aliases: ['망간'] },
  { key: 'selenium',    name: '셀레늄',     rda: 55,    unit: 'μg',      aliases: ['셀레늄', '셀렌'] },
  { key: 'iodine',      name: '요오드',     rda: 150,   unit: 'μg',      aliases: ['요오드'] },
  { key: 'molybdenum',  name: '몰리브덴',   rda: 25,    unit: 'μg',      aliases: ['몰리브덴'] },
  { key: 'potassium',   name: '칼륨',       rda: 3500,  unit: 'mg',      aliases: ['칼륨'] },
  { key: 'phosphorus',  name: '인',         rda: 700,   unit: 'mg',      aliases: ['인'] },
  { key: 'chromium',    name: '크롬',       rda: 30,    unit: 'μg',      aliases: ['크롬'] },
]

// RDA% 기반 색상 (배경색)
export function getRdaColor(amount, rda) {
  if (!amount || !rda) return null
  const pct = (amount / rda) * 100
  if (pct >= 100) return '#166534' // dark green
  if (pct >= 75)  return '#4ade80' // light green
  if (pct >= 50)  return '#facc15' // yellow
  if (pct >= 30)  return '#fb923c' // orange
  return '#f87171'                 // red
}

// RDA% 기반 글자색 (배경이 진할 때 흰색)
export function getRdaTextColor(amount, rda) {
  if (!amount || !rda) return null
  const pct = (amount / rda) * 100
  if (pct >= 100) return '#ffffff'
  return '#1a1a2e'
}

// RDA% 기반 Excel hex 색상 (# 없이)
export function getRdaExcelColor(amount, rda) {
  if (!amount || !rda) return null
  const pct = (amount / rda) * 100
  if (pct >= 100) return '166534'
  if (pct >= 75)  return '81C784'
  if (pct >= 50)  return 'FFF176'
  if (pct >= 30)  return 'FFB74D'
  return 'EF9A9A'
}

export function getRdaExcelTextColor(amount, rda) {
  if (!amount || !rda) return null
  const pct = (amount / rda) * 100
  if (pct >= 100) return 'FFFFFF'
  return '1A1A2E'
}
