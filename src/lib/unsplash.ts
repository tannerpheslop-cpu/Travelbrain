const UNSPLASH_ACCESS_KEY = '9Doegj_QRdqRMkueINm_xND4XvKVZcCoLlekKKx5iMY'
const TRAVEL_TOPIC_ID = 'bo8jQKTaE0Y'

interface UnsplashSearchResult {
  results: Array<{
    urls: {
      regular: string
      small: string
    }
    user: {
      name: string
      links: { html: string }
    }
  }>
}

async function searchUnsplash(query: string, useTravelTopic: boolean): Promise<UnsplashSearchResult | null> {
  const params = new URLSearchParams({
    query,
    orientation: 'landscape',
    per_page: '3',
    content_filter: 'high',
    ...(useTravelTopic ? { topics: TRAVEL_TOPIC_ID } : {}),
  })

  const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  })

  if (!res.ok) {
    console.warn(`[unsplash] Search failed for "${query}": ${res.status}`)
    return null
  }

  return res.json()
}

/**
 * Fetch a high-quality landscape travel photo for a destination from Unsplash.
 * Tries Travel topic first, falls back to unrestricted search.
 * Returns the regular-size URL (~1080px wide) + photographer credit, or null.
 */
export async function fetchDestinationPhoto(
  locationName: string,
): Promise<{ url: string; photographer: string; profileUrl: string } | null> {
  const query = locationName.split(',')[0].trim()
  if (!query) return null

  try {
    // Try Travel topic first
    let data = await searchUnsplash(`${query} travel`, true)
    if (!data?.results?.length) {
      // Fallback: unrestricted search
      data = await searchUnsplash(`${query} travel`, false)
    }
    if (!data?.results?.length) return null

    const photo = data.results[0]
    return {
      url: photo.urls.regular,
      photographer: photo.user.name,
      profileUrl: photo.user.links.html,
    }
  } catch (err) {
    console.warn('[unsplash] Fetch error:', err)
    return null
  }
}
