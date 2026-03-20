import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import LoadingSpinner from './components/common/LoadingSpinner'

const HomePage = lazy(() => import('./pages/HomePage'))
const PlanPage = lazy(() => import('./pages/PlanPage'))
const MapPage = lazy(() => import('./pages/MapPage'))
const NearbyPage = lazy(() => import('./pages/NearbyPage'))
const TrainsPage = lazy(() => import('./pages/TrainsPage'))
const AlertsPage = lazy(() => import('./pages/AlertsPage'))
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

export default function App() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" className="min-h-screen bg-white" />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="nearby" element={<NearbyPage />} />
          <Route path="trains" element={<TrainsPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
