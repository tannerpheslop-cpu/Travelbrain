import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import LoginPage from './pages/LoginPage'
import InboxPage from './pages/InboxPage'
import SavePage from './pages/SavePage'
import TripsPage from './pages/TripsPage'
import ItemDetailPage from './pages/ItemDetailPage'
import TripDetailPage from './pages/TripDetailPage'
import SharedTripPage from './pages/SharedTripPage'

function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-lg mx-auto">
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/save" element={<SavePage />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/item/:id" element={<ItemDetailPage />} />
          <Route path="/trip/:id" element={<TripDetailPage />} />
          <Route path="/" element={<Navigate to="/inbox" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/s/:shareToken" element={<SharedTripPage />} />
        <Route path="/*" element={<AppLayout />} />
      </Routes>
    </BrowserRouter>
  )
}
