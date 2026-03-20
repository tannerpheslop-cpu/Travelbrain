import { supabase } from './supabase'
import { detectLocationFromText } from './placesTextSearch'
import { fetchDestinationPhoto } from './unsplash'
import type { CoverImageSource } from '../types'

/**
 * Try to set a trip's cover image by detecting a location in the trip title
 * and fetching an Unsplash photo for it.
 *
 * Only runs if the trip has no destinations and its cover_image_source is not 'user_upload'.
 * Returns the URL if successful, or null.
 */
export async function trySetTripCoverFromName(
  tripId: string,
  tripTitle: string,
): Promise<string | null> {
  try {
    const location = await detectLocationFromText(tripTitle)
    if (!location) return null

    const photo = await fetchDestinationPhoto(location.name)
    if (!photo?.url) return null

    await supabase
      .from('trips')
      .update({
        cover_image_url: photo.url,
        cover_image_source: 'trip_name' as CoverImageSource,
      })
      .eq('id', tripId)

    return photo.url
  } catch (err) {
    console.warn('[tripCoverImage] Failed to set cover from trip name:', err)
    return null
  }
}

/**
 * When a destination with an image is added to a trip, update the trip's cover
 * if the current cover came from the trip name (not user-uploaded).
 *
 * Destination images are more specific and should take priority over name-derived images.
 */
export async function maybeUpdateCoverFromDestination(
  tripId: string,
  destinationImageUrl: string,
  currentCoverSource: CoverImageSource | null,
): Promise<void> {
  // Never overwrite a user-uploaded cover
  if (currentCoverSource === 'user_upload') return

  try {
    await supabase
      .from('trips')
      .update({
        cover_image_url: destinationImageUrl,
        cover_image_source: 'destination' as CoverImageSource,
      })
      .eq('id', tripId)
  } catch (err) {
    console.warn('[tripCoverImage] Failed to update cover from destination:', err)
  }
}
