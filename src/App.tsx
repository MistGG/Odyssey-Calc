import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { BrowsePage } from './pages/BrowsePage'
import { DigimonDetailPage } from './pages/DigimonDetailPage'
import { DpsLabPage } from './pages/DpsLabPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<BrowsePage />} />
          <Route path="digimon/:id" element={<DigimonDetailPage />} />
          <Route path="lab" element={<DpsLabPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
