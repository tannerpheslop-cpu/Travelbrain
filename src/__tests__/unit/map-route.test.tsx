import { describe, it, expect, beforeEach } from 'vitest'
import type { Map as MapboxMap } from 'mapbox-gl'

// Track added sources and layers
const addedSources: Array<{ id: string; config: unknown }> = []
const addedLayers: Array<{ id: string; config: unknown }> = []

function createMockMap() {
  addedSources.length = 0
  addedLayers.length = 0
  return {
    addSource: (id: string, config: unknown) => { addedSources.push({ id, config }) },
    addLayer: (config: Record<string, unknown>) => { addedLayers.push({ id: config.id as string, config }) },
    getLayer: (id: string) => addedLayers.find(l => l.id === id) ?? null,
    removeLayer: (id: string) => {
      const idx = addedLayers.findIndex(l => l.id === id)
      if (idx >= 0) addedLayers.splice(idx, 1)
    },
    getSource: (id: string) => addedSources.find(s => s.id === id) ?? null,
    removeSource: (id: string) => {
      const idx = addedSources.findIndex(s => s.id === id)
      if (idx >= 0) addedSources.splice(idx, 1)
    },
  } as unknown as MapboxMap
}

import { createMapRoute } from '../../components/map/MapRoute'

describe('MapRoute (Mapbox)', () => {
  let mockMap: MapboxMap

  beforeEach(() => {
    mockMap = createMockMap()
  })

  it('creates source and layers when given 2+ coordinates', () => {
    const points = [
      { lat: 35.68, lng: 139.69 },
      { lat: 35.01, lng: 135.77 },
      { lat: 34.69, lng: 135.50 },
    ]
    createMapRoute(mockMap, points)

    expect(addedSources.length).toBe(1)
    expect(addedSources[0].id).toBe('youji-route')
    // 2 layers: glow + dash
    expect(addedLayers.length).toBe(2)
  })

  it('does not create source/layers for fewer than 2 coordinates', () => {
    createMapRoute(mockMap, [{ lat: 35.68, lng: 139.69 }])
    expect(addedSources.length).toBe(0)
    expect(addedLayers.length).toBe(0)
  })

  it('glow layer uses correct accent color and opacity', () => {
    createMapRoute(mockMap, [
      { lat: 35.68, lng: 139.69 },
      { lat: 35.01, lng: 135.77 },
    ])

    const glowLayer = addedLayers.find(l => l.id === 'youji-route-glow')
    expect(glowLayer).toBeDefined()
    const paint = (glowLayer!.config as Record<string, unknown>).paint as Record<string, unknown>
    expect(paint['line-color']).toBe('#c45a2d')
    expect(paint['line-opacity']).toBe(0.08)
    expect(paint['line-width']).toBe(6)
  })

  it('dash layer uses dashed line pattern', () => {
    createMapRoute(mockMap, [
      { lat: 35.68, lng: 139.69 },
      { lat: 35.01, lng: 135.77 },
    ])

    const dashLayer = addedLayers.find(l => l.id === 'youji-route-dash')
    expect(dashLayer).toBeDefined()
    const paint = (dashLayer!.config as Record<string, unknown>).paint as Record<string, unknown>
    expect(paint['line-dasharray']).toEqual([3, 2])
    expect(paint['line-opacity']).toBe(0.55)
  })
})
