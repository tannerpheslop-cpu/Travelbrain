import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdate = vi.fn()
const mockEq = vi.fn()

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: (...args: unknown[]) => {
        mockUpdate(...args)
        return {
          eq: (...eqArgs: unknown[]) => {
            mockEq(...eqArgs)
            return Promise.resolve({ error: null })
          },
        }
      },
    })),
  },
}))

const mockDetect = vi.fn()
vi.mock('../placesTextSearch', () => ({
  detectLocationFromText: (...args: unknown[]) => mockDetect(...args),
}))

const mockFetchPhoto = vi.fn()
vi.mock('../unsplash', () => ({
  fetchDestinationPhoto: (...args: unknown[]) => mockFetchPhoto(...args),
}))

// ── Import after mocks ──────────────────────────────────────────────────────

import { trySetTripCoverFromName, maybeUpdateCoverFromDestination } from '../tripCoverImage'

describe('trySetTripCoverFromName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('detects location in trip title, fetches Unsplash photo, and updates trip', async () => {
    mockDetect.mockResolvedValue({ name: 'China', lat: 35, lng: 104, placeId: 'abc' })
    mockFetchPhoto.mockResolvedValue({ url: 'https://unsplash.com/china.jpg', photographer: 'John', profileUrl: 'https://unsplash.com/@john' })

    const result = await trySetTripCoverFromName('trip-1', 'China')

    expect(mockDetect).toHaveBeenCalledWith('China')
    expect(mockFetchPhoto).toHaveBeenCalledWith('China')
    expect(mockUpdate).toHaveBeenCalledWith({
      cover_image_url: 'https://unsplash.com/china.jpg',
      cover_image_source: 'trip_name',
    })
    expect(result).toBe('https://unsplash.com/china.jpg')
  })

  it('returns null when no location is detected in title', async () => {
    mockDetect.mockResolvedValue(null)

    const result = await trySetTripCoverFromName('trip-2', 'My Summer Plans')

    expect(mockDetect).toHaveBeenCalledWith('My Summer Plans')
    expect(mockFetchPhoto).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('returns null when Unsplash returns no photo', async () => {
    mockDetect.mockResolvedValue({ name: 'Tokyo', lat: 35.6, lng: 139.7, placeId: 'xyz' })
    mockFetchPhoto.mockResolvedValue(null)

    const result = await trySetTripCoverFromName('trip-3', 'Tokyo')

    expect(mockDetect).toHaveBeenCalledWith('Tokyo')
    expect(mockFetchPhoto).toHaveBeenCalledWith('Tokyo')
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('returns null when detectLocationFromText throws', async () => {
    mockDetect.mockRejectedValue(new Error('API error'))

    const result = await trySetTripCoverFromName('trip-4', 'Japan')

    expect(result).toBeNull()
  })

  it('returns null when fetchDestinationPhoto throws', async () => {
    mockDetect.mockResolvedValue({ name: 'Paris', lat: 48.8, lng: 2.3, placeId: 'def' })
    mockFetchPhoto.mockRejectedValue(new Error('Network error'))

    const result = await trySetTripCoverFromName('trip-5', 'Paris')

    expect(result).toBeNull()
  })
})

describe('maybeUpdateCoverFromDestination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates cover when current source is trip_name', async () => {
    await maybeUpdateCoverFromDestination('trip-1', 'https://dest.jpg', 'trip_name')

    expect(mockUpdate).toHaveBeenCalledWith({
      cover_image_url: 'https://dest.jpg',
      cover_image_source: 'destination',
    })
  })

  it('updates cover when current source is null (no existing cover)', async () => {
    await maybeUpdateCoverFromDestination('trip-2', 'https://dest2.jpg', null)

    expect(mockUpdate).toHaveBeenCalledWith({
      cover_image_url: 'https://dest2.jpg',
      cover_image_source: 'destination',
    })
  })

  it('updates cover when current source is destination (replacing old destination image)', async () => {
    await maybeUpdateCoverFromDestination('trip-3', 'https://new-dest.jpg', 'destination')

    expect(mockUpdate).toHaveBeenCalledWith({
      cover_image_url: 'https://new-dest.jpg',
      cover_image_source: 'destination',
    })
  })

  it('does NOT update cover when current source is user_upload', async () => {
    await maybeUpdateCoverFromDestination('trip-4', 'https://dest.jpg', 'user_upload')

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
