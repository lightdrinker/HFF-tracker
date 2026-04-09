// 원료 사전 통합 컬럼 정의
export const INGREDIENT_COLUMNS = [
  { key: 'name',        label: '원료명',      defaultOn: true },
  { key: 'type',        label: '유형',        defaultOn: true, desc: '고시형 / 개별인정' },
  { key: 'fnclty',      label: '기능성',      defaultOn: true, desc: '해당 원료의 기능성 내용' },
  { key: 'intakeLow',   label: '섭취량 하한',  desc: '일일 최소 섭취량' },
  { key: 'intakeHigh',  label: '섭취량 상한',  desc: '일일 최대 섭취량' },
  { key: 'unit',        label: '단위',        desc: '섭취량 단위 (mg, g 등)' },
  { key: 'caution',     label: '주의사항',     desc: '섭취 시 주의사항' },
  { key: 'indicator',   label: '지표성분',     desc: '기능성 지표 원료명', typeTag: '고시형' },
  { key: 'company',     label: '신청업체',     desc: '원료 인정 신청 업체명', typeTag: '개별인정' },
  { key: 'rcognNo',     label: '인정번호',     desc: '기능성 원료 인정 고유번호', typeTag: '개별인정' },
  { key: 'rcognDt',     label: '인정일자',     desc: '기능성 원료 인정 날짜', typeTag: '개별인정' },
]

// 유형 필터 옵션
export const TYPE_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'notified', label: '고시형' },
  { value: 'individual', label: '개별인정' },
]
