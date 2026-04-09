import { fetchAllForExport } from '../api/fetchAll'

// 3개 API 데이터를 통합하여 중복 제거된 원료 사전 생성
export async function loadAllIngredients(onProgress) {
  // 3개 API 순차 호출 (병렬 호출 시 식약처 API rate limit 발생)
  if (onProgress) onProgress('고시형 원료 로딩 중...')
  const notified = await fetchAllForExport('I2710', null)

  if (onProgress) onProgress('개별인정 원료 로딩 중...')
  const recognized = await fetchAllForExport('I-0040', null)

  if (onProgress) onProgress('개별인정 상세 로딩 중...')
  const individual = await fetchAllForExport('I-0050', null)

  if (onProgress) onProgress('병합 중...')

  // I-0050을 인정번호 기준 Map으로 변환 (I-0040과 조인용)
  const i0050Map = new Map()
  for (const item of individual) {
    const no = normalizeRcognNo(item.HF_FNCLTY_MTRAL_RCOGN_NO)
    if (no) i0050Map.set(no, item)
  }

  const results = []

  // 1) 고시형 (I2710) → 그대로 추가
  for (const item of notified) {
    results.push({
      name: item.PRDCT_NM || '',
      type: '고시형',
      fnclty: item.PRIMARY_FNCLTY || '',
      intakeLow: item.DAY_INTK_LOWLIMIT || '',
      intakeHigh: item.DAY_INTK_HIGHLIMIT || '',
      unit: item.INTK_UNIT || '',
      caution: item.IFTKN_ATNT_MATR_CN || '',
      indicator: item.SKLL_IX_IRDNT_RAWMTRL || '',
      company: '',
      rcognNo: '',
      rcognDt: '',
    })
  }

  // 2) 개별인정 (I-0040 기준 + I-0050 보충)
  const usedI0050Keys = new Set()

  for (const item of recognized) {
    const no = normalizeRcognNo(item.HF_FNCLTY_MTRAL_RCOGN_NO)
    const spec = no ? i0050Map.get(no) : null
    if (no) usedI0050Keys.add(no)

    results.push({
      name: item.APLC_RAWMTRL_NM || '',
      type: '개별인정',
      fnclty: item.FNCLTY_CN || '',
      intakeLow: spec?.DAY_INTK_LOWLIMIT || item.DAY_INTK_CN || '',
      intakeHigh: spec?.DAY_INTK_HIGHLIMIT || '',
      unit: spec?.WT_UNIT || '',
      caution: item.IFTKN_ATNT_MATR_CN || '',
      indicator: '',
      company: item.BSSH_NM || '',
      rcognNo: item.HF_FNCLTY_MTRAL_RCOGN_NO || '',
      rcognDt: item.PRMS_DT || '',
    })
  }

  // 3) I-0050에만 있고 I-0040에 없는 항목 추가
  for (const item of individual) {
    const no = normalizeRcognNo(item.HF_FNCLTY_MTRAL_RCOGN_NO)
    if (no && usedI0050Keys.has(no)) continue // 이미 조인됨

    results.push({
      name: item.RAWMTRL_NM || '',
      type: '개별인정',
      fnclty: item.PRIMARY_FNCLTY || '',
      intakeLow: item.DAY_INTK_LOWLIMIT || '',
      intakeHigh: item.DAY_INTK_HIGHLIMIT || '',
      unit: item.WT_UNIT || '',
      caution: item.IFTKN_ATNT_MATR_CN || '',
      indicator: '',
      company: '',
      rcognNo: item.HF_FNCLTY_MTRAL_RCOGN_NO || '',
      rcognDt: '',
    })
  }

  return results
}

// 인정번호 정규화 (공백, "New", "제", "호" 등 제거하여 비교)
function normalizeRcognNo(no) {
  if (!no) return ''
  return no.replace(/\s+/g, '').replace(/^New/i, '').replace(/^제/, '').replace(/호$/, '').trim()
}
