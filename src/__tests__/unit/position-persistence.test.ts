import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadPersistedPositions,
  savePersistedPositions,
  STORAGE_KEY,
} from '../../components/horizon/useGraphSimulation'

beforeEach(() => {
  sessionStorage.clear()
})

describe('Position persistence', () => {
  it('saves positions to sessionStorage', () => {
    const positions = new Map([
      ['node-1', { x: 100, y: 200 }],
      ['node-2', { x: 300, y: 400 }],
    ])
    savePersistedPositions(positions)
    const raw = sessionStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed['node-1']).toEqual({ x: 100, y: 200 })
  })

  it('loads positions from sessionStorage', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      'node-1': { x: 50, y: 60 },
      'node-2': { x: 70, y: 80 },
    }))
    const loaded = loadPersistedPositions()
    expect(loaded.get('node-1')).toEqual({ x: 50, y: 60 })
    expect(loaded.get('node-2')).toEqual({ x: 70, y: 80 })
  })

  it('returns empty map when sessionStorage has no data', () => {
    const loaded = loadPersistedPositions()
    expect(loaded.size).toBe(0)
  })

  it('returns empty map when sessionStorage has invalid JSON', () => {
    sessionStorage.setItem(STORAGE_KEY, 'not-json')
    const loaded = loadPersistedPositions()
    expect(loaded.size).toBe(0)
  })

  it('roundtrips correctly', () => {
    const positions = new Map([
      ['a', { x: 10, y: 20 }],
      ['b', { x: 30, y: 40 }],
      ['c', { x: 50, y: 60 }],
    ])
    savePersistedPositions(positions)
    const loaded = loadPersistedPositions()
    expect(loaded.size).toBe(3)
    expect(loaded.get('a')).toEqual({ x: 10, y: 20 })
    expect(loaded.get('c')).toEqual({ x: 50, y: 60 })
  })
})
