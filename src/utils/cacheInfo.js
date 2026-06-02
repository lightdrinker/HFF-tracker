const ENDPOINT_LABELS = {
  C003: '제품 목록(C003)',
  I2710: '고시형 원료(I2710)',
  'I-0040': '개별인정형 원료(I-0040)',
  'I-0050': '개별인정형 상세(I-0050)',
}

export function formatCacheDate(iso) {
  if (!iso) return ''

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function endpointCount(meta, endpoint) {
  return meta?.endpoints?.[endpoint]?.itemCount || 0
}

export function endpointSummary(meta, endpoints) {
  return endpoints
    .map((endpoint) => {
      const count = endpointCount(meta, endpoint)
      const label = ENDPOINT_LABELS[endpoint] || endpoint
      return `${label} ${count.toLocaleString()}건`
    })
    .join(', ')
}

export function cacheBasisText(cacheStatus, endpoints) {
  if (cacheStatus?.state === 'loading') {
    const percent = cacheStatus.progress?.percent
    return percent == null
      ? 'GitHub Actions가 만든 정적 캐시를 불러오는 중입니다.'
      : `GitHub Actions가 만든 정적 캐시를 불러오는 중입니다. ${percent}%`
  }

  if (cacheStatus?.state === 'error') {
    return `정적 캐시를 불러오지 못했습니다. ${cacheStatus.error || ''}`.trim()
  }

  if (cacheStatus?.state !== 'ready') {
    return 'GitHub Actions가 만든 정적 캐시를 준비하는 중입니다.'
  }

  const generatedAt = formatCacheDate(cacheStatus.meta?.generatedAt)
  const summary = endpointSummary(cacheStatus.meta, endpoints)
  return `GitHub Actions가 매일 새벽 갱신한 정적 캐시를 불러왔습니다. 기준 시각: ${generatedAt}. ${summary}.`
}
