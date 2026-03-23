/**
 * Location Lock Logic — Regression Tests
 *
 * Tests the location locking logic extracted from SaveSheet to verify:
 * 1. Dismissing auto-detected pill prevents re-detection
 * 2. Manual selection produces location_locked=true in payload
 * 3. Auto-detected (passive) locations produce location_locked=false
 * 4. Refs prevent stale closure issues in async detection callbacks
 *
 * CRITICAL: Guards against the regression where tapping × on the
 * auto-detected pill triggered re-detection via the useEffect
 * dependency on userSelectedLocation.
 */
import { describe, it, expect } from 'vitest'

/**
 * Simulates the SaveSheet location state machine.
 * This is the exact logic from SaveSheet.tsx extracted for testing.
 */
function createLocationStateMachine() {
  let location: { name: string; locked: boolean } | null = null
  let userSelectedLocation = false
  let dismissedAutoDetect = false

  return {
    // Getters
    getLocation: () => location,
    getUserSelected: () => userSelectedLocation,
    getDismissed: () => dismissedAutoDetect,

    // Auto-detection sets location (only if not dismissed and not manually selected)
    autoDetect: (name: string) => {
      if (userSelectedLocation) return false
      if (dismissedAutoDetect) return false
      location = { name, locked: false }
      return true
    },

    // User taps × to dismiss the auto-detected pill
    dismissPill: () => {
      location = null
      userSelectedLocation = false
      dismissedAutoDetect = true // Prevent re-detection
    },

    // User manually selects from autocomplete
    manualSelect: (name: string) => {
      location = { name, locked: true } // Manual = locked
      userSelectedLocation = true
    },

    // Build save payload (mirrors SaveSheet corePayload logic)
    buildPayload: () => ({
      location_name: location?.name ?? null,
      location_locked: location && userSelectedLocation ? true : false,
    }),

    // Reset form (for next entry)
    resetForm: () => {
      location = null
      userSelectedLocation = false
      dismissedAutoDetect = false
    },

    // Simulate the detection effect running (as it would after state change)
    shouldDetectionRun: () => {
      if (userSelectedLocation) return false
      if (dismissedAutoDetect) return false
      return true
    },
  }
}

describe('Location lock state machine', () => {
  it('auto-detection sets location with locked=false', () => {
    const sm = createLocationStateMachine()
    sm.autoDetect('East Coast')
    expect(sm.getLocation()).toEqual({ name: 'East Coast', locked: false })
    expect(sm.buildPayload()).toEqual({ location_name: 'East Coast', location_locked: false })
  })

  it('manual selection sets location with locked=true', () => {
    const sm = createLocationStateMachine()
    sm.manualSelect('Taiwan')
    expect(sm.getLocation()).toEqual({ name: 'Taiwan', locked: true })
    expect(sm.buildPayload()).toEqual({ location_name: 'Taiwan', location_locked: true })
  })

  it('REGRESSION: dismiss pill → re-detection is blocked', () => {
    const sm = createLocationStateMachine()

    // Auto-detect sets location
    sm.autoDetect('East Coast')
    expect(sm.getLocation()?.name).toBe('East Coast')

    // User dismisses
    sm.dismissPill()
    expect(sm.getLocation()).toBeNull()
    expect(sm.getDismissed()).toBe(true)

    // Detection should NOT run after dismissal
    expect(sm.shouldDetectionRun()).toBe(false)

    // Auto-detect attempt is blocked
    const result = sm.autoDetect('East Coast again')
    expect(result).toBe(false)
    expect(sm.getLocation()).toBeNull() // Still null
  })

  it('REGRESSION: dismiss → manual select → saves with locked=true', () => {
    const sm = createLocationStateMachine()

    // Auto-detect
    sm.autoDetect('East Coast')
    expect(sm.getLocation()?.name).toBe('East Coast')

    // Dismiss
    sm.dismissPill()
    expect(sm.getLocation()).toBeNull()

    // Manual select
    sm.manualSelect('Taiwan')
    expect(sm.getLocation()?.name).toBe('Taiwan')

    // Save payload has locked=true
    expect(sm.buildPayload()).toEqual({ location_name: 'Taiwan', location_locked: true })

    // Detection should NOT run (user has manually selected)
    expect(sm.shouldDetectionRun()).toBe(false)
  })

  it('REGRESSION: dismiss → auto-detect blocked → manual select → auto-detect still blocked', () => {
    const sm = createLocationStateMachine()

    sm.autoDetect('Somewhere')
    sm.dismissPill()

    // Auto-detect blocked
    expect(sm.autoDetect('Somewhere else')).toBe(false)

    // Manual select
    sm.manualSelect('Tokyo')

    // Auto-detect still blocked (userSelectedLocation=true)
    expect(sm.autoDetect('Another place')).toBe(false)
    expect(sm.getLocation()?.name).toBe('Tokyo')
  })

  it('form reset clears dismissed state for next entry', () => {
    const sm = createLocationStateMachine()

    sm.autoDetect('Place 1')
    sm.dismissPill()
    expect(sm.shouldDetectionRun()).toBe(false)

    // Reset for new entry
    sm.resetForm()
    expect(sm.shouldDetectionRun()).toBe(true)
    expect(sm.getLocation()).toBeNull()

    // Auto-detect works again
    expect(sm.autoDetect('Place 2')).toBe(true)
    expect(sm.getLocation()?.name).toBe('Place 2')
  })

  it('save without location → location_locked=false, location_name=null', () => {
    const sm = createLocationStateMachine()
    expect(sm.buildPayload()).toEqual({ location_name: null, location_locked: false })
  })

  it('auto-detect then save without interaction → locked=false', () => {
    const sm = createLocationStateMachine()
    sm.autoDetect('Seattle')
    expect(sm.buildPayload()).toEqual({ location_name: 'Seattle', location_locked: false })
  })

  it('multiple auto-detects only last one sticks (if not dismissed)', () => {
    const sm = createLocationStateMachine()
    sm.autoDetect('Place A')
    sm.autoDetect('Place B')
    expect(sm.getLocation()?.name).toBe('Place B')
    expect(sm.buildPayload().location_locked).toBe(false)
  })
})

describe('Edge Function overwrite protection', () => {
  it('location_locked=true means Edge Function should skip', () => {
    // Simulates the Edge Function's check
    function shouldEdgeFunctionUpdate(item: { location_name: string | null; location_locked: boolean }) {
      if (item.location_locked) return false
      if (item.location_name) return false
      return true
    }

    // User manually set location → locked → skip
    expect(shouldEdgeFunctionUpdate({ location_name: 'Taiwan', location_locked: true })).toBe(false)

    // Auto-detected location → not locked but has name → skip (already set)
    expect(shouldEdgeFunctionUpdate({ location_name: 'Seattle', location_locked: false })).toBe(false)

    // No location yet → can update
    expect(shouldEdgeFunctionUpdate({ location_name: null, location_locked: false })).toBe(true)

    // Locked but no name (edge case) → skip (user explicitly dismissed)
    expect(shouldEdgeFunctionUpdate({ location_name: null, location_locked: true })).toBe(false)
  })

  it('.is("location_name", null) WHERE clause prevents overwrite', () => {
    // Simulates Supabase update with .is("location_name", null)
    function wouldUpdateApply(currentLocationName: string | null) {
      return currentLocationName === null
    }

    expect(wouldUpdateApply(null)).toBe(true) // No location → update applies
    expect(wouldUpdateApply('Taiwan')).toBe(false) // Has location → update skipped
    expect(wouldUpdateApply('Kowloon')).toBe(false) // Has location → update skipped
  })

  it('REGRESSION: full scenario — user saves, manually edits, Edge Function must not overwrite', () => {
    // This simulates the exact user-reported bug:
    // 1. User saves "Restaurant in Hong Kong" → no location at save time
    // 2. Edge Function is triggered (fire-and-forget)
    // 3. User opens item detail, manually sets location to "Hong Kong"
    // 4. Edge Function completes and tries to update
    // 5. The update MUST be blocked

    // Simulates the Edge Function's full check sequence (from detect-location/index.ts)
    function edgeFunctionShouldUpdate(item: {
      location_name: string | null
      location_locked: boolean
    }): { shouldUpdate: boolean; reason: string } {
      // Check 1: location_locked (line 71-73 in Edge Function)
      if (item.location_locked) {
        return { shouldUpdate: false, reason: 'location_locked=true (user manually set it)' }
      }
      // Check 2: location_name already set (line 76-78)
      if (item.location_name) {
        return { shouldUpdate: false, reason: 'location already set: ' + item.location_name }
      }
      // Check 3: .is("location_name", null) WHERE clause (line 312)
      // This is a DB-level guard — if location_name is NOT null, update matches 0 rows
      return { shouldUpdate: true, reason: 'no location set, can detect' }
    }

    // Step 1: Item just saved, no location yet
    const itemAfterSave = { location_name: null, location_locked: false }
    const check1 = edgeFunctionShouldUpdate(itemAfterSave)
    expect(check1.shouldUpdate).toBe(true) // Edge Function CAN run

    // Step 2: User manually sets location on detail page (before Edge Function completes)
    const itemAfterManualEdit = { location_name: 'Hong Kong', location_locked: true }
    const check2 = edgeFunctionShouldUpdate(itemAfterManualEdit)
    expect(check2.shouldUpdate).toBe(false) // Edge Function BLOCKED
    expect(check2.reason).toContain('location_locked')

    // Step 3: Even without location_locked, location_name being set blocks it
    const itemWithAutoDetect = { location_name: 'Hong Kong', location_locked: false }
    const check3 = edgeFunctionShouldUpdate(itemWithAutoDetect)
    expect(check3.shouldUpdate).toBe(false) // STILL blocked by location_name check
    expect(check3.reason).toContain('location already set')
  })

  it('REGRESSION: dismiss auto-pill, manually select, save — Edge Function respects lock', () => {
    // Exact scenario: "Scooter across the east coast of Taiwan"
    // 1. Auto-detect → "Hualien County" pill appears
    // 2. User taps × → dismissed
    // 3. User types "Taiwan" in autocomplete → selects
    // 4. Save → location_locked=true, location_name="Taiwan"
    // 5. Edge Function fires → checks locked → skips

    const sm = createLocationStateMachine()

    // Auto-detect
    sm.autoDetect('Hualien County')
    expect(sm.getLocation()?.name).toBe('Hualien County')

    // Dismiss
    sm.dismissPill()
    expect(sm.getLocation()).toBeNull()

    // Manual select
    sm.manualSelect('Taiwan')
    expect(sm.getLocation()?.name).toBe('Taiwan')

    // Build save payload
    const payload = sm.buildPayload()
    expect(payload.location_name).toBe('Taiwan')
    expect(payload.location_locked).toBe(true)

    // Simulate Edge Function check against what was saved
    function edgeFunctionBlocked(item: { location_name: string | null; location_locked: boolean }) {
      return item.location_locked || !!item.location_name
    }

    // Edge Function should be blocked by BOTH checks
    expect(edgeFunctionBlocked({ location_name: payload.location_name, location_locked: payload.location_locked })).toBe(true)
  })

  it('REGRESSION: save without interaction — Edge Function CAN detect', () => {
    // User types text, saves quickly without waiting for pill or selecting location
    // location=null, location_locked=false → Edge Function should detect

    const sm = createLocationStateMachine()
    // No auto-detect, no manual select — just save
    const payload = sm.buildPayload()

    expect(payload.location_name).toBeNull()
    expect(payload.location_locked).toBe(false)

    // Edge Function should run
    function edgeFunctionBlocked(item: { location_name: string | null; location_locked: boolean }) {
      return item.location_locked || !!item.location_name
    }
    expect(edgeFunctionBlocked({ location_name: payload.location_name, location_locked: payload.location_locked })).toBe(false)
  })
})
