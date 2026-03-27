import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMapboxMock } from '../helpers/mockMapbox'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
  Object.defineProperty(window, 'innerHeight', { value: 800, writable: true })
})

vi.mock('mapbox-gl', () => createMapboxMock())
vi.mock('../../lib/googleMaps', () => ({ loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [] }) })) })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
  },
  supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-key', invokeEdgeFunction: vi.fn(),
}))

import UnifiedTripMap from '../../components/map/UnifiedTripMap'
import type { DestWithCount } from '../../hooks/queries'

function makeDest(overrides: Partial<DestWithCount> & { id: string }): DestWithCount {
  return {
    trip_id: 'trip-1', location_name: 'Tokyo, Japan', location_lat: 35.68, location_lng: 139.69,
    location_place_id: 'ChIJ_tokyo', location_country: 'Japan', location_country_code: 'JP',
    location_type: 'city', image_url: null, image_source: null,
    image_credit_name: null, image_credit_url: null, location_name_en: null, location_name_local: null,
    route_id: null, start_date: null, end_date: null, sort_order: 0,
    proximity_radius_km: 50, created_at: new Date().toISOString(), notes: null, _count: 2,
    ...overrides,
  }
}

const tokyo = makeDest({ id: 'd1', sort_order: 0 })

describe('Sheet content crossfade', () => {
  it('sheet header fade wrapper has CSS opacity transition', () => {
    render(
      <UnifiedTripMap
        tripId="trip-1" tripTitle="Japan" statusLabel="Planning" metadataLine="1 dest"
        destinations={[tokyo]} onBack={vi.fn()} initialDestId="d1"
      />,
    )
    const headerFade = screen.getByTestId('sheet-header-fade')
    expect(headerFade.style.transition).toContain('opacity')
  })

  it('sheet content fade wrapper has CSS opacity transition', () => {
    render(
      <UnifiedTripMap
        tripId="trip-1" tripTitle="Japan" statusLabel="Planning" metadataLine="1 dest"
        destinations={[tokyo]} onBack={vi.fn()} initialDestId="d1"
      />,
    )
    const contentFade = screen.getByTestId('sheet-content-fade')
    expect(contentFade.style.transition).toContain('opacity')
  })

  it('sheet content starts at opacity 1 when entering directly at destination level', () => {
    render(
      <UnifiedTripMap
        tripId="trip-1" tripTitle="Japan" statusLabel="Planning" metadataLine="1 dest"
        destinations={[tokyo]} onBack={vi.fn()} initialDestId="d1"
      />,
    )
    const contentFade = screen.getByTestId('sheet-content-fade')
    expect(contentFade.style.opacity).toBe('1')
  })

  it('sheet is present and has overflow hidden (Vaul renders it)', () => {
    render(
      <UnifiedTripMap
        tripId="trip-1" tripTitle="Japan" statusLabel="Planning" metadataLine="1 dest"
        destinations={[tokyo]} onBack={vi.fn()} initialDestId="d1"
      />,
    )
    const sheet = screen.getByTestId('draggable-sheet')
    expect(sheet).toBeInTheDocument()
    expect(sheet.style.overflow).toBe('hidden')
  })
})
