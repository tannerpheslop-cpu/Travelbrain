const UNSPLASH_ACCESS_KEY = '9Doegj_QRdqRMkueINm_xND4XvKVZcCoLlekKKx5iMY'

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

/**
 * Fetch a high-quality landscape photo for a destination from Unsplash.
 * Returns the regular-size URL (~1080px wide) or null if nothing found.
 */
export async function fetchDestinationPhoto(
  locationName: string,
): Promise<{ url: string; photographer: string; profileUrl: string } | null> {
  // Strip extra qualifiers — use just the city/place name for better results
  const query = locationName.split(',')[0].trim()
  if (!query) return null

  try {
    const params = new URLSearchParams({
      query: `${query} travel`,
      orientation: 'landscape',
      per_page: '1',
    })

    const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
    })

    if (!res.ok) {
      console.warn(`[unsplash] Search failed for "${query}": ${res.status}`)
      return null
    }

    const data: UnsplashSearchResult = await res.json()
    if (!data.results || data.results.length === 0) return null

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
