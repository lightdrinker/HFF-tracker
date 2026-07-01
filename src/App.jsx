import { useEffect, useState } from 'react'
import { TABS } from './config/tabs'
import TabView from './components/TabView'
import NutrientAnalysisView from './components/NutrientAnalysisView'
import IngredientDictView from './components/IngredientDictView'
import { subscribeCacheStatus } from './api/hffCache'
import { formatCacheDate } from './utils/cacheInfo'
import './App.css'

export default function App() {
  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const [cacheStatus, setCacheStatus] = useState({ state: 'idle', meta: null, progress: null, error: null })
  const tab = TABS.find(t => t.id === activeTab)

  useEffect(() => subscribeCacheStatus(setCacheStatus), [])

  function renderTab() {
    if (tab.customComponent === 'ingredient-dict') return <IngredientDictView key={activeTab} tab={tab} cacheStatus={cacheStatus} />
    if (tab.customComponent) return <NutrientAnalysisView key={activeTab} tab={tab} cacheStatus={cacheStatus} />
    return <TabView key={activeTab} tab={tab} cacheStatus={cacheStatus} />
  }

  function getCacheStatusText() {
    if (cacheStatus.state === 'ready') {
      const count = cacheStatus.meta?.endpoints?.C003?.itemCount || 0
      const generatedAt = cacheStatus.meta?.generatedAt
      const generatedText = generatedAt ? ` 기준 시각: ${formatCacheDate(generatedAt)}.` : ''
      return `GitHub Actions 정적 캐시 ${count.toLocaleString()}건을 불러왔습니다.${generatedText}`
    }

    if (cacheStatus.state === 'loading') {
      const progress = cacheStatus.progress
      if (progress?.percent != null) return `캐시 로드 중 ${progress.percent}%`
      if (progress?.loadedBytes) return `캐시 로드 중 ${(progress.loadedBytes / 1024 / 1024).toFixed(1)}MB`
      return 'GitHub Actions가 만든 전체 캐시를 불러오는 중입니다.'
    }

    if (cacheStatus.state === 'error') {
      return `캐시 파일을 불러오지 못했습니다. ${cacheStatus.error || ''}`
    }

    return '전체 캐시를 준비하는 중입니다.'
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>HFF Tracker</h1>
          <p className="header-sub">건강기능식품 데이터 엑셀 추출 도구</p>
        </div>
        <div className={`cache-status ${cacheStatus.state}`}>
          <span>{getCacheStatusText()}</span>
          {cacheStatus.state === 'loading' && cacheStatus.progress?.percent != null && (
            <div className="cache-progress" aria-hidden="true">
              <div className="cache-progress-fill" style={{ width: `${cacheStatus.progress.percent}%` }} />
            </div>
          )}
        </div>
      </header>

      <nav className="tab-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {renderTab()}
      </main>

      <footer className="app-footer">
        <span className="footer-copy">(c) 2026 <strong className="footer-name">Jun</strong></span>
      </footer>
    </div>
  )
}
