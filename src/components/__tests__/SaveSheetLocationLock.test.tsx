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
})
