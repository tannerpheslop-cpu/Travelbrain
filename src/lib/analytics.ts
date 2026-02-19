import { supabase } from './supabase'

/**
 * Tracks an analytics event by inserting a row into analytics_events.
 * Fire-and-forget — never throws, never blocks the caller.
 *
 * @param eventName  The event name (e.g. 'save_created')
 * @param userId     The current user's UUID, or null for anonymous events
 * @param properties Optional JSONB payload with event-specific data
 */
export function trackEvent(
  eventName: string,
  userId: string | null,
  properties?: Record<string, unknown>
): void {
  supabase
    .from('analytics_events')
    .insert({
      user_id: userId ?? null,
      event_name: eventName,
      properties: properties ?? null,
    })
    .then(({ error }) => {
      if (error) {
        // Non-fatal — analytics should never break the app
        console.warn('[analytics] trackEvent failed:', eventName, error.message)
      }
    })
}
