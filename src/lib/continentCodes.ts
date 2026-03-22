/**
 * Continent/region → country code mapping for geographic scope filtering.
 * Used to filter destination suggestions when a trip name implies a region.
 */
export const CONTINENT_CODES: Record<string, string[]> = {
  'asia': ['CN', 'JP', 'KR', 'TH', 'VN', 'ID', 'MY', 'SG', 'PH', 'IN', 'LK', 'NP', 'MM', 'KH', 'LA', 'MN', 'TW', 'HK', 'MO', 'BN', 'TL', 'BT', 'MV', 'BD', 'PK', 'AF', 'UZ', 'KZ', 'KG', 'TJ', 'TM', 'AZ', 'GE', 'AM', 'TR', 'IQ', 'IR', 'SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'YE', 'JO', 'LB', 'SY', 'IL', 'PS'],
  'europe': ['FR', 'DE', 'IT', 'ES', 'GB', 'PT', 'NL', 'BE', 'CH', 'AT', 'GR', 'CZ', 'PL', 'SE', 'NO', 'DK', 'FI', 'IE', 'HR', 'HU', 'RO', 'BG', 'SK', 'SI', 'EE', 'LV', 'LT', 'LU', 'MT', 'CY', 'IS', 'AL', 'RS', 'ME', 'MK', 'BA', 'XK', 'MD', 'UA', 'BY'],
  'south america': ['BR', 'AR', 'CL', 'CO', 'PE', 'EC', 'BO', 'UY', 'PY', 'VE', 'GY', 'SR'],
  'north america': ['US', 'CA', 'MX', 'GT', 'BZ', 'HN', 'SV', 'NI', 'CR', 'PA', 'CU', 'JM', 'HT', 'DO', 'PR', 'TT', 'BB', 'BS'],
  'africa': ['ZA', 'KE', 'TZ', 'MA', 'EG', 'NG', 'GH', 'ET', 'RW', 'UG', 'SN', 'CI', 'CM', 'MZ', 'ZW', 'BW', 'NA', 'MU', 'MG', 'TN', 'DZ', 'LY'],
  'oceania': ['AU', 'NZ', 'FJ', 'PG', 'WS', 'TO', 'VU', 'SB', 'PW', 'FM', 'MH', 'KI', 'NR', 'TV'],
  'southeast asia': ['TH', 'VN', 'ID', 'MY', 'SG', 'PH', 'MM', 'KH', 'LA', 'BN', 'TL'],
  'east asia': ['CN', 'JP', 'KR', 'TW', 'HK', 'MO', 'MN'],
  'central america': ['GT', 'BZ', 'HN', 'SV', 'NI', 'CR', 'PA'],
}

/**
 * Given a trip title, return a set of country codes that match the geographic scope,
 * or null if no scope is detected.
 */
export function getScopedCountryCodes(
  tripTitle: string,
  clusters: Array<{ country: string; country_code: string; cities: Array<{ name: string }> }>,
): Set<string> | null {
  if (!tripTitle || !clusters.length) return null
  const titleLower = tripTitle.toLowerCase()

  // Check continent/region names
  for (const [continent, codes] of Object.entries(CONTINENT_CODES)) {
    if (titleLower.includes(continent)) {
      const continentSet = new Set(codes)
      const matched = new Set<string>()
      for (const cluster of clusters) {
        if (continentSet.has(cluster.country_code)) {
          matched.add(cluster.country_code)
        }
      }
      if (matched.size > 0) return matched
    }
  }

  // Check country/city names
  const matchedCodes = new Set<string>()
  for (const cluster of clusters) {
    if (titleLower.includes(cluster.country.toLowerCase())) {
      matchedCodes.add(cluster.country_code)
      continue
    }
    for (const city of cluster.cities) {
      const cityName = city.name.split(',')[0].trim().toLowerCase()
      if (cityName.length >= 3 && titleLower.includes(cityName)) {
        matchedCodes.add(cluster.country_code)
        break
      }
    }
  }
  return matchedCodes.size > 0 ? matchedCodes : null
}
