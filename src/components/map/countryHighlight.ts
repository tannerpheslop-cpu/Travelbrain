import type { Map as MapboxMap } from 'mapbox-gl'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import { MAP_COLORS } from './mapConfig'

const WORLD_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
const SOURCE_ID = 'youji-country-highlights'
const LAYER_ID = 'youji-country-highlight-fill'

// ISO 3166-1 numeric → alpha-2 lookup (covers most countries).
// Source: https://en.wikipedia.org/wiki/ISO_3166-1_numeric
const NUMERIC_TO_ALPHA2: Record<string, string> = {
  '004': 'AF', '008': 'AL', '012': 'DZ', '016': 'AS', '020': 'AD', '024': 'AO',
  '028': 'AG', '031': 'AZ', '032': 'AR', '036': 'AU', '040': 'AT', '044': 'BS',
  '048': 'BH', '050': 'BD', '051': 'AM', '052': 'BB', '056': 'BE', '060': 'BM',
  '064': 'BT', '068': 'BO', '070': 'BA', '072': 'BW', '076': 'BR', '084': 'BZ',
  '090': 'SB', '096': 'BN', '100': 'BG', '104': 'MM', '108': 'BI', '112': 'BY',
  '116': 'KH', '120': 'CM', '124': 'CA', '132': 'CV', '140': 'CF', '144': 'LK',
  '148': 'TD', '152': 'CL', '156': 'CN', '158': 'TW', '170': 'CO', '174': 'KM',
  '178': 'CG', '180': 'CD', '184': 'CK', '188': 'CR', '191': 'HR', '192': 'CU',
  '196': 'CY', '203': 'CZ', '204': 'BJ', '208': 'DK', '212': 'DM', '214': 'DO',
  '218': 'EC', '222': 'SV', '226': 'GQ', '231': 'ET', '232': 'ER', '233': 'EE',
  '234': 'FO', '238': 'FK', '242': 'FJ', '246': 'FI', '250': 'FR', '254': 'GF',
  '258': 'PF', '260': 'TF', '262': 'DJ', '266': 'GA', '268': 'GE', '270': 'GM',
  '275': 'PS', '276': 'DE', '288': 'GH', '292': 'GI', '296': 'KI', '300': 'GR',
  '304': 'GL', '308': 'GD', '312': 'GP', '316': 'GU', '320': 'GT', '324': 'GN',
  '328': 'GY', '332': 'HT', '336': 'VA', '340': 'HN', '344': 'HK', '348': 'HU',
  '352': 'IS', '356': 'IN', '360': 'ID', '364': 'IR', '368': 'IQ', '372': 'IE',
  '376': 'IL', '380': 'IT', '384': 'CI', '388': 'JM', '392': 'JP', '398': 'KZ',
  '400': 'JO', '404': 'KE', '408': 'KP', '410': 'KR', '414': 'KW', '417': 'KG',
  '418': 'LA', '422': 'LB', '426': 'LS', '428': 'LV', '430': 'LR', '434': 'LY',
  '438': 'LI', '440': 'LT', '442': 'LU', '446': 'MO', '450': 'MG', '454': 'MW',
  '458': 'MY', '462': 'MV', '466': 'ML', '470': 'MT', '474': 'MQ', '478': 'MR',
  '480': 'MU', '484': 'MX', '492': 'MC', '496': 'MN', '498': 'MD', '499': 'ME',
  '504': 'MA', '508': 'MZ', '512': 'OM', '516': 'NA', '520': 'NR', '524': 'NP',
  '528': 'NL', '531': 'CW', '533': 'AW', '534': 'SX', '540': 'NC', '548': 'VU',
  '554': 'NZ', '558': 'NI', '562': 'NE', '566': 'NG', '570': 'NU', '574': 'NF',
  '578': 'NO', '580': 'MP', '583': 'FM', '584': 'MH', '585': 'PW', '586': 'PK',
  '591': 'PA', '598': 'PG', '600': 'PY', '604': 'PE', '608': 'PH', '616': 'PL',
  '620': 'PT', '624': 'GW', '626': 'TL', '630': 'PR', '634': 'QA', '638': 'RE',
  '642': 'RO', '643': 'RU', '646': 'RW', '652': 'BL', '654': 'SH', '659': 'KN',
  '660': 'AI', '662': 'LC', '663': 'MF', '666': 'PM', '670': 'VC', '674': 'SM',
  '678': 'ST', '682': 'SA', '686': 'SN', '688': 'RS', '690': 'SC', '694': 'SL',
  '702': 'SG', '703': 'SK', '704': 'VN', '705': 'SI', '706': 'SO', '710': 'ZA',
  '716': 'ZW', '724': 'ES', '728': 'SS', '729': 'SD', '732': 'EH', '740': 'SR',
  '748': 'SZ', '752': 'SE', '756': 'CH', '760': 'SY', '762': 'TJ', '764': 'TH',
  '768': 'TG', '772': 'TK', '776': 'TO', '780': 'TT', '784': 'AE', '788': 'TN',
  '792': 'TR', '795': 'TM', '796': 'TC', '798': 'TV', '800': 'UG', '804': 'UA',
  '807': 'MK', '818': 'EG', '826': 'GB', '831': 'GG', '832': 'JE', '833': 'IM',
  '834': 'TZ', '840': 'US', '850': 'VI', '854': 'BF', '858': 'UY', '860': 'UZ',
  '862': 'VE', '876': 'WF', '882': 'WS', '887': 'YE', '894': 'ZM',
  // Kosovo (not in ISO but in Natural Earth)
  '-99': 'XK',
}

let cachedGeoJSON: GeoJSON.FeatureCollection | null = null

async function loadCountryGeoJSON(): Promise<GeoJSON.FeatureCollection> {
  if (cachedGeoJSON) return cachedGeoJSON
  const res = await fetch(WORLD_ATLAS_URL)
  const topo = (await res.json()) as Topology
  const fc = feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection
  cachedGeoJSON = fc
  return fc
}

/**
 * Add country highlight fill layer to the map for the given country codes.
 * Returns a cleanup function to remove the source + layer.
 */
export async function addCountryHighlights(
  map: MapboxMap,
  countryCodes: string[],
  dark: boolean,
): Promise<() => void> {
  const cleanup = () => {
    try {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    } catch { /* ignore */ }
  }

  cleanup() // Remove previous
  if (countryCodes.length === 0) return cleanup

  const codesSet = new Set(countryCodes.map(c => c.toUpperCase()))

  try {
    const allCountries = await loadCountryGeoJSON()
    const filtered: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: allCountries.features.filter(f => {
        const numericId = String(f.id)
        const alpha2 = NUMERIC_TO_ALPHA2[numericId]
        return alpha2 && codesSet.has(alpha2)
      }),
    }

    if (filtered.features.length === 0) return cleanup

    map.addSource(SOURCE_ID, { type: 'geojson', data: filtered })

    // Find the first symbol layer to insert below it
    const layers = map.getStyle()?.layers ?? []
    let beforeLayerId: string | undefined
    for (const layer of layers) {
      if (layer.type === 'symbol') {
        beforeLayerId = layer.id
        break
      }
    }

    map.addLayer(
      {
        id: LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': MAP_COLORS.accent,
          'fill-opacity': dark ? 0.20 : 0.15,
        },
      },
      beforeLayerId,
    )
  } catch (err) {
    console.error('[countryHighlight] Failed to add country highlights:', err)
  }

  return cleanup
}
