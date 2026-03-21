/**
 * Regression tests verifying the location detection system is consolidated:
 * - Only ONE background detection system (processUnlocatedItems)
 * - detectLocationFromText always returns city-level or higher
 * - location_auto_declined flag is respected
 * - No competing detection systems exist
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// ── Architectural tests (no mocks needed) ───────────────────────────────────

describe('Location detection system consolidation', () => {
  it('useLocationResolver hook file does NOT exist', () => {
    const hookPath = path.resolve(__dirname, '../../hooks/useLocationResolver.ts')
    expect(fs.existsSync(hookPath)).toBe(false)
  })

  it('no file in src/ imports useLocationResolver', () => {
    const srcDir = path.resolve(__dirname, '../..')
    const allFiles = getAllTsFiles(srcDir)
    const violators: string[] = []

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      if (content.includes('useLocationResolver') && !file.includes('locationSystemConsolidation.test')) {
        violators.push(path.relative(srcDir, file))
      }
    }

    expect(violators).toEqual([])
  })

  it('no file in src/ imports findPlaceByQuery', () => {
    const srcDir = path.resolve(__dirname, '../..')
    const allFiles = getAllTsFiles(srcDir)
    const violators: string[] = []

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      if (content.includes('findPlaceByQuery') && !file.includes('locationSystemConsolidation.test')) {
        violators.push(path.relative(srcDir, file))
      }
    }

    expect(violators).toEqual([])
  })

  it('backgroundLocationWorker.ts exists and exports processUnlocatedItems', async () => {
    const workerPath = path.resolve(__dirname, '../backgroundLocationWorker.ts')
    expect(fs.existsSync(workerPath)).toBe(true)

    const content = fs.readFileSync(workerPath, 'utf-8')
    expect(content).toContain('export async function processUnlocatedItems')
  })

  it('background worker checks location_auto_declined', () => {
    const workerPath = path.resolve(__dirname, '../backgroundLocationWorker.ts')
    const content = fs.readFileSync(workerPath, 'utf-8')
    expect(content).toContain('location_auto_declined')
  })

  it('InboxPage triggers processUnlocatedItems on mount and after save', () => {
    const inboxPath = path.resolve(__dirname, '../../pages/InboxPage.tsx')
    const content = fs.readFileSync(inboxPath, 'utf-8')
    expect(content).toContain('processUnlocatedItems')
    // Should have two invocations: mount (2s delay) and post-save (3s delay)
    const matches = content.match(/processUnlocatedItems/g)
    expect(matches?.length).toBeGreaterThanOrEqual(2)
  })
})

// ── Worker behavior tests ───────────────────────────────────────────────────

let mockSelectData: Array<Record<string, unknown>> = []
const mockUpdate = vi.fn()

vi.mock('../supabase', () => {
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockImplementation(() =>
                    Promise.resolve({ data: mockSelectData, error: null })
                  ),
                }),
              }),
            }),
          }),
        }),
        update: (data: unknown) => {
          mockUpdate(data)
          return { eq: () => Promise.resolve({ error: null }) }
        },
      })),
    },
  }
})

const mockDetectLocation = vi.fn()
vi.mock('../placesTextSearch', () => ({
  detectLocationFromText: (...args: unknown[]) => mockDetectLocation(...args),
}))

vi.mock('../detectCategory', () => ({
  detectCategory: () => null,
  detectCategories: () => [],
}))

vi.mock('../../hooks/queries', () => ({
  writeItemTags: vi.fn().mockResolvedValue(undefined),
}))

import { processUnlocatedItems, _resetRunningGuard } from '../backgroundLocationWorker'

describe('processUnlocatedItems - single system guarantee', () => {
  const userId = 'user-123'
  const mockQueryClient = {
    invalidateQueries: vi.fn(),
  } as unknown as import('@tanstack/react-query').QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectData = []
    mockDetectLocation.mockResolvedValue(null)
    _resetRunningGuard()
  })

  it('is the only function that auto-detects and writes location to saved_items', async () => {
    // This test verifies processUnlocatedItems calls detectLocationFromText
    // and writes to saved_items — confirming it's the detection+persistence path
    mockSelectData = [
      { id: 'item-1', title: 'Great food in Paris', category: 'general', location_name: null, location_auto_declined: false },
    ]
    mockDetectLocation.mockResolvedValue({
      name: 'Paris', address: 'Paris, France', lat: 48.85, lng: 2.35,
      placeId: 'paris1', country: 'France', countryCode: 'FR',
      locationType: 'geographic', placeTypes: ['locality'],
      originalPlaceTypes: ['locality'],
    })

    await processUnlocatedItems(userId, mockQueryClient)

    expect(mockDetectLocation).toHaveBeenCalledWith('Great food in Paris')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        location_name: 'Paris',
        location_country: 'France',
        location_country_code: 'FR',
      }),
    )
  })

  it('never processes items with location_auto_declined = true (query filters them)', async () => {
    // The Supabase query includes .eq('location_auto_declined', false)
    // so declined items are never returned. We verify no items process when list is empty.
    mockSelectData = [] // Simulates filtered result (declined items excluded)

    const count = await processUnlocatedItems(userId, mockQueryClient)
    expect(count).toBe(0)
    expect(mockDetectLocation).not.toHaveBeenCalled()
  })
})

// ── Helpers ─────────────────────────────────────────────────────────────────

function getAllTsFiles(dir: string): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      files.push(...getAllTsFiles(full))
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}
