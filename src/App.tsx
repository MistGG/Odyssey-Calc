import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthPage } from './pages/AuthPage'
import { BrowsePage } from './pages/BrowsePage'
import { DigimonDetailPage } from './pages/DigimonDetailPage'
import { DpsLabPage } from './pages/DpsLabPage'
import { GearPage } from './pages/GearPage'
import { MeterParsesPage } from './pages/MeterParsesPage'
import { CompanionPage } from './pages/CompanionPage'
import { TierChangesPage } from './pages/TierChangesPage'
import { TierListPage } from './pages/TierListPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<BrowsePage />} />
          <Route path="auth" element={<AuthPage />} />
          <Route path="digimon/:id" element={<DigimonDetailPage />} />
          <Route path="lab" element={<DpsLabPage />} />
          <Route path="gear" element={<GearPage />} />
          <Route path="tier-list" element={<TierListPage />} />
          <Route path="changes" element={<TierChangesPage />} />
          <Route path="meter-parses" element={<MeterParsesPage />} />
          <Route path="companion" element={<CompanionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
