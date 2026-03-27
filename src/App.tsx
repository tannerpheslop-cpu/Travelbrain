import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AuthProvider } from './lib/auth'
import ProtectedRoute from './components/ProtectedRoute'
import BottomNav from './components/BottomNav'
import LoginPage from './pages/LoginPage'
import InboxPage from './pages/InboxPage'
import TripsPage from './pages/TripsPage'
import ItemDetailPage from './pages/ItemDetailPage'
import TripOverviewPage from './pages/TripOverviewPage'
import RouteOverviewPage from './pages/RouteOverviewPage'
// DestinationDetailPage removed — unified into TripOverviewPage via UnifiedTripMap
import ProfilePage from './pages/ProfilePage'
import SearchPage from './pages/SearchPage'
import SharedTripPage from './pages/SharedTripPage'
import GlobalActions from './components/GlobalActions'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import NotFoundPage from './pages/NotFoundPage'
import DevLoginPage from './pages/DevLoginPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,     // Data is fresh for 2 minutes
      gcTime: 1000 * 60 * 10,        // Cache kept for 10 minutes even if unused
      refetchOnWindowFocus: false,    // Don't refetch on tab focus
      retry: 1,                       // Retry failed queries once
    },
  },
})

function AppLayout() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-bg-page">
        <main className="max-w-lg mx-auto">
          <Routes>
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/trips" element={<TripsPage />} />
            <Route path="/item/:id" element={<ItemDetailPage />} />
            <Route path="/trip/:id" element={<TripOverviewPage />} />
            <Route path="/trip/:id/dest/:destId" element={<TripOverviewPage />} />
            <Route path="/trip/:id/route/:routeId" element={<RouteOverviewPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/" element={<Navigate to="/inbox" replace />} />
            <Route path="*" element={<NotFoundPage />} />
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
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {import.meta.env.DEV && <Route path="/dev-login" element={<DevLoginPage />} />}
              <Route path="/s/:shareToken" element={<SharedTripPage />} />
              <Route path="/*" element={<AppLayout />} />
            </Routes>
          </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
