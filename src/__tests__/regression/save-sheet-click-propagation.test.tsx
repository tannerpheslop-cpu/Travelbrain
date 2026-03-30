import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

// Mock dependencies that SaveSheet needs
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn() })) })),
      select: vi.fn(() => ({ eq: vi.fn() })),
    })),
    storage: { from: vi.fn(() => ({ upload: vi.fn() })) },
  },
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
  invokeEdgeFunction: vi.fn(),
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com', user_metadata: {} },
  }),
}))

vi.mock('../../lib/googleMaps', () => ({
  loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined),
  fetchBilingualNames: vi.fn(),
  fetchPlacePhoto: vi.fn(),
}))

vi.mock('../../lib/placesTextSearch', () => ({
  detectLocationFromText: vi.fn(),
  extractGeoPortion: vi.fn(),
}))

import SaveSheet from '../../components/SaveSheet'

describe('BUG-003 regression: SaveSheet click propagation closes sheet', () => {
  it('does not call onClose when clicking inside the sheet content area', () => {
    const onClose = vi.fn()
    const onSaved = vi.fn()

    render(<SaveSheet onClose={onClose} onSaved={onSaved} />, { wrapper })

    // Find the sheet content div (fixed bottom-0 z-50)
    const sheetContent = document.querySelector('.fixed.inset-x-0.bottom-0.z-50')
    expect(sheetContent).toBeTruthy()

    // Click inside the sheet content — should NOT trigger onClose
    fireEvent.click(sheetContent!)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when clicking the backdrop', () => {
    const onClose = vi.fn()
    const onSaved = vi.fn()

    render(<SaveSheet onClose={onClose} onSaved={onSaved} />, { wrapper })

    // Find the backdrop div (fixed inset-0 z-40)
    const backdrop = document.querySelector('.fixed.inset-0.z-40')
    expect(backdrop).toBeTruthy()

    // Click backdrop — should trigger onClose
    fireEvent.click(backdrop!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
