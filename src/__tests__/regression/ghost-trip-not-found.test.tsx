import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock Supabase to return null for any trip query (non-existent UUID)
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          order: vi.fn(() => ({
            data: [],
            error: null,
          })),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        order: vi.fn(() => ({
          data: [],
          error: null,
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
  invokeEdgeFunction: vi.fn(),
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com', user_metadata: {} },
    signOut: vi.fn(),
  }),
}))

vi.mock('../../lib/googleMaps', () => ({
  loadGoogleMapsScript: vi.fn(),
  fetchBilingualNames: vi.fn(),
  fetchPlacePhoto: vi.fn(),
}))

import TripOverviewPage from '../../pages/TripOverviewPage'

function renderWithRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/trip/00000000-0000-0000-0000-000000000000']}>
        <Routes>
          <Route path="/trip/:id" element={<TripOverviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BUG-001 regression: non-existent trip shows ghost trip page', () => {
  it('shows "Trip not found" when navigating to a non-existent trip UUID', async () => {
    renderWithRouter()

    await waitFor(
      () => {
        expect(screen.getByText('Trip not found')).toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    expect(
      screen.getByText(/This trip may have been deleted/),
    ).toBeInTheDocument()
  })

  it('does not render trip action buttons for a non-existent trip', async () => {
    renderWithRouter()

    await waitFor(
      () => {
        expect(screen.getByText('Trip not found')).toBeInTheDocument()
      },
      { timeout: 5000 },
    )

    // No share, companions, or menu buttons should render
    expect(screen.queryByText('Add Destination')).not.toBeInTheDocument()
    expect(screen.queryByText('Destinations')).not.toBeInTheDocument()
    expect(screen.queryByText('Itinerary')).not.toBeInTheDocument()
  })
})
