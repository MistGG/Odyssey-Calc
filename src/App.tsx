import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { BrowsePage } from './pages/BrowsePage'
import { DigimonDetailPage } from './pages/DigimonDetailPage'
import { DpsLabPage } from './pages/DpsLabPage'
import { LocalDevPage } from './pages/LocalDevPage'
import { TierListPage } from './pages/TierListPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<BrowsePage />} />
          <Route path="digimon/:id" element={<DigimonDetailPage />} />
          <Route path="lab" element={<DpsLabPage />} />
          <Route path="tier-list" element={<TierListPage />} />
          <Route path="local" element={<LocalDevPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
