import { useState } from 'react'
import { TABS } from './config/tabs'
import TabView from './components/TabView'
import NutrientAnalysisView from './components/NutrientAnalysisView'
import './App.css'

export default function App() {
  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const tab = TABS.find(t => t.id === activeTab)

  return (
    <div className="app">
      <header className="header">
        <h1>HFF Tracker</h1>
        <p className="header-sub">건강기능식품 데이터 엑셀 추출 도구</p>
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
        {tab.customComponent
          ? <NutrientAnalysisView key={activeTab} tab={tab} />
          : <TabView key={activeTab} tab={tab} />
        }
      </main>
    </div>
  )
}
