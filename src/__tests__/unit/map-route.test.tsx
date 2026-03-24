import { describe, it, expect, beforeAll } from 'vitest'

// Track created polylines to verify options
const createdPolylines: Array<{ opts: Record<string, unknown> }> = []

beforeAll(() => {
  class MockPolyline {
    constructor(opts: Record<string, unknown>) {
      createdPolylines.push({ opts })
    }
    setMap() {}
    setPath() {}
    getPath() { return [] }
  }

  ;(globalThis as Record<string, unknown>).google = {
    maps: {
      Polyline: MockPolyline,
      SymbolPath: { FORWARD_CLOSED_ARROW: 2 },
      LatLng: class {
        lat: number; lng: number
        constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng }
      },
    },
  }
})

import { createMapRoute } from '../../components/map/MapRoute'

describe('MapRoute', () => {
  beforeEach(() => {
    createdPolylines.length = 0
  })

  it('renders polylines when given 2+ destination coordinates', () => {
    const mockMap = {} as google.maps.Map
    const points = [
      { lat: 35.68, lng: 139.69 },
      { lat: 35.01, lng: 135.77 },
      { lat: 34.69, lng: 135.50 },
    ]

    createMapRoute(mockMap, points)

    // Should create 3 polylines: glow, main dashed, arrows
    expect(createdPolylines.length).toBe(3)
  })

  it('does not render polylines when given fewer than 2 coordinates', () => {
    const mockMap = {} as google.maps.Map

    createMapRoute(mockMap, [{ lat: 35.68, lng: 139.69 }])
    expect(createdPolylines.length).toBe(0)

    createMapRoute(mockMap, [])
    expect(createdPolylines.length).toBe(0)
  })

  it('uses the correct accent stroke color (#c45a2d) for the glow line', () => {
    const mockMap = {} as google.maps.Map
    const points = [
      { lat: 35.68, lng: 139.69 },
      { lat: 35.01, lng: 135.77 },
    ]

    createMapRoute(mockMap, points)

    // First polyline is the glow line
    const glowOpts = createdPolylines[0].opts
    expect(glowOpts.strokeColor).toBe('#c45a2d')
    expect(glowOpts.strokeOpacity).toBe(0.08)
    expect(glowOpts.strokeWeight).toBe(6)
  })

  it('uses geodesic: true for curved paths', () => {
    const mockMap = {} as google.maps.Map
    const points = [
      { lat: 35.68, lng: 139.69 },
      { lat: 35.01, lng: 135.77 },
    ]

    createMapRoute(mockMap, points)

    for (const p of createdPolylines) {
      expect(p.opts.geodesic).toBe(true)
    }
  })
})
