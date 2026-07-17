import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthPage } from './pages/AuthPage'
import { HomePage } from './pages/HomePage'
import { BrowsePage } from './pages/BrowsePage'
import { DigimonDetailPage } from './pages/DigimonDetailPage'
import { DpsLabPage } from './pages/DpsLabPage'
import { RotationAnalysisPage } from './pages/RotationAnalysisPage'
import { GearPage } from './pages/GearPage'
import { MeterMyParsesPage } from './pages/MeterMyParsesPage'
import { MeterMyRewardsPage } from './pages/MeterMyRewardsPage'
import { MeterShopLayout } from './components/MeterShopLayout'
import { MeterThemeShopBarThemesPage } from './pages/MeterThemeShopBarThemesPage'
import { MeterPlayerProfilePage } from './pages/MeterPlayerProfilePage'
import { MeterParsesPage } from './pages/MeterParsesPage'
import { MeterPublicPage } from './pages/MeterPublicPage'
import { MeterMagiaThemePreviewPage } from './pages/MeterMagiaThemePreviewPage'
import { MeterCycleThemePreviewPage } from './pages/MeterCycleThemePreviewPage'
import { MeterHallOfFamePage } from './pages/MeterHallOfFamePage'
import { MeterTamerSearchPage } from './pages/MeterTamerSearchPage'
import { CompanionPage } from './pages/CompanionPage'
import { MayClearEventPage } from './pages/MayClearEventPage'
import { TierChangesPage } from './pages/TierChangesPage'
import { TierListPage } from './pages/TierListPage'
import { GuidebookPage } from './pages/GuidebookPage'
import { CommunityGuidesPage } from './pages/CommunityGuidesPage'
import { CommunityGuideDetailPage } from './pages/CommunityGuideDetailPage'
import { CommunityGuideGearStatsPage } from './pages/CommunityGuideGearStatsPage'
import { CommunityGuideEditorPage } from './pages/CommunityGuideEditorPage'
import { DungeonsPage } from './pages/DungeonsPage'
import { PatchNotesPage } from './pages/PatchNotesPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="digimon" element={<BrowsePage />} />
          <Route path="guidebook" element={<GuidebookPage />} />
          <Route path="guides" element={<CommunityGuidesPage />} />
          <Route path="guides/new" element={<CommunityGuideEditorPage />} />
          <Route path="guides/edit/:id" element={<CommunityGuideEditorPage />} />
          <Route path="guides/gear-stats" element={<CommunityGuideGearStatsPage />} />
          <Route path="guides/:slug" element={<CommunityGuideDetailPage />} />
          <Route path="patch-notes" element={<PatchNotesPage />} />
          <Route path="patch-notes/:slug" element={<PatchNotesPage />} />
          <Route path="dungeons" element={<DungeonsPage />} />
          <Route path="auth" element={<AuthPage />} />
          <Route path="digimon/:id" element={<DigimonDetailPage />} />
          <Route path="lab" element={<DpsLabPage />} />
          <Route path="lab/rotation" element={<RotationAnalysisPage />} />
          <Route path="gear" element={<GearPage />} />
          <Route path="tier-list" element={<TierListPage />} />
          <Route path="changes" element={<TierChangesPage />} />
          <Route path="meter" element={<MeterPublicPage />} />
          <Route path="meter/leaderboard" element={<Navigate to="/meter" replace />} />
          <Route path="meter/activity" element={<Navigate to="/meter" replace />} />
          <Route path="meter/hall-of-fame" element={<MeterHallOfFamePage />} />
          <Route path="meter/cycle-theme-preview" element={<MeterCycleThemePreviewPage />} />
          <Route path="meter/leaderboard-preview" element={<Navigate to="/meter" replace />} />
          <Route path="meter/search" element={<MeterTamerSearchPage />} />
          <Route path="meter/player/:playerKey" element={<MeterPlayerProfilePage />} />
          <Route path="meter/my-parses" element={<MeterMyParsesPage />} />
          <Route path="meter/shop" element={<MeterShopLayout />}>
            <Route index element={<Navigate to="bar-themes/common" replace />} />
            <Route path=":categoryId" element={<Navigate to="common" replace />} />
            <Route path=":categoryId/:subcategoryId" element={<MeterThemeShopBarThemesPage />} />
          </Route>
          <Route path="meter/magia-theme-preview" element={<MeterMagiaThemePreviewPage />} />
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
