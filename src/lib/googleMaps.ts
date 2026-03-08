/**
 * Dynamically loads the Google Maps JavaScript API (with Places library)
 * exactly once, even if called from multiple components simultaneously.
 */

let _promise: Promise<void> | null = null

export function loadGoogleMapsScript(): Promise<void> {
  // Already loaded
  if (typeof window !== 'undefined' && window.google?.maps?.places) {
    return Promise.resolve()
  }

  // Load in progress — return the same promise
  if (_promise) return _promise

  _promise = new Promise<void>((resolve, reject) => {
    const key = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined
    if (!key || key === 'YOUR_KEY_HERE') {
      console.warn('[googleMaps] VITE_GOOGLE_PLACES_API_KEY is not set. Location autocomplete will not work.')
      // Resolve anyway so the component renders without crashing
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = (e) => {
      console.error('[googleMaps] Failed to load Google Maps script', e)
      _promise = null   // allow retry on next call
      reject(new Error('Failed to load Google Maps'))
    }
    document.head.appendChild(script)
  })

  return _promise
}
