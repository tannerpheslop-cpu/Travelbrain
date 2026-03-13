import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import ProtectedRoute from './components/ProtectedRoute'
import BottomNav from './components/BottomNav'
import LoginPage from './pages/LoginPage'
import InboxPage from './pages/InboxPage'
import TripsPage from './pages/TripsPage'
import ItemDetailPage from './pages/ItemDetailPage'
import TripDetailPage from './pages/TripDetailPage'
import ProfilePage from './pages/ProfilePage'
import SearchPage from './pages/SearchPage'
import SharedTripPage from './pages/SharedTripPage'
import GlobalActions from './components/GlobalActions'

function AppLayout() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-lg mx-auto">
          <Routes>
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/trips" element={<TripsPage />} />
            <Route path="/item/:id" element={<ItemDetailPage />} />
            <Route path="/trip/:id" element={<TripDetailPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/" element={<Navigate to="/inbox" replace />} />
          </Routes>
        </main>
        <BottomNav />
        <GlobalActions />
      </div>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/s/:shareToken" element={<SharedTripPage />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
