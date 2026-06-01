import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthPage } from './pages/AuthPage'
import { BrowsePage } from './pages/BrowsePage'
import { DigimonDetailPage } from './pages/DigimonDetailPage'
import { DpsLabPage } from './pages/DpsLabPage'
import { GearPage } from './pages/GearPage'
import { MeterMyParsesPage } from './pages/MeterMyParsesPage'
import { MeterMyRewardsPage } from './pages/MeterMyRewardsPage'
import { MeterShopLayout } from './components/MeterShopLayout'
import { MeterThemeShopBarThemesPage } from './pages/MeterThemeShopBarThemesPage'
import { MeterPlayerProfilePage } from './pages/MeterPlayerProfilePage'
import { MeterParsesPage } from './pages/MeterParsesPage'
import { MeterActivityPage } from './pages/MeterActivityPage'
import { MeterPublicPage } from './pages/MeterPublicPage'
import { MeterHallOfFamePage } from './pages/MeterHallOfFamePage'
import { MeterTamerSearchPage } from './pages/MeterTamerSearchPage'
import { CompanionPage } from './pages/CompanionPage'
import { MayClearEventPage } from './pages/MayClearEventPage'
import { TierChangesPage } from './pages/TierChangesPage'
import { TierListPage } from './pages/TierListPage'
import { GuidebookPage } from './pages/GuidebookPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<BrowsePage />} />
          <Route path="guidebook" element={<GuidebookPage />} />
          <Route path="auth" element={<AuthPage />} />
          <Route path="digimon/:id" element={<DigimonDetailPage />} />
          <Route path="lab" element={<DpsLabPage />} />
          <Route path="gear" element={<GearPage />} />
          <Route path="tier-list" element={<TierListPage />} />
          <Route path="changes" element={<TierChangesPage />} />
          <Route path="meter" element={<MeterActivityPage />} />
          <Route path="meter/leaderboard" element={<MeterPublicPage />} />
          <Route path="meter/hall-of-fame" element={<MeterHallOfFamePage />} />
          <Route path="meter/search" element={<MeterTamerSearchPage />} />
          <Route path="meter/player/:playerKey" element={<MeterPlayerProfilePage />} />
          <Route path="meter/my-parses" element={<MeterMyParsesPage />} />
          <Route path="meter/shop" element={<MeterShopLayout />}>
            <Route index element={<Navigate to="bar-themes/common" replace />} />
            <Route path="bar-themes" element={<Navigate to="common" replace />} />
            <Route path="bar-themes/:subcategoryId" element={<MeterThemeShopBarThemesPage />} />
          </Route>
          <Route path="meter/rewards" element={<MeterMyRewardsPage />} />
          <Route path="meter-parses" element={<MeterParsesPage />} />
          <Route path="companion" element={<CompanionPage />} />
          <Route path="event" element={<MayClearEventPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
