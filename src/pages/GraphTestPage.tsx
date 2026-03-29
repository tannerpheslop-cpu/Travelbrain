import { useState } from 'react'
import SunsetBackground from '../components/horizon/SunsetBackground'
import TravelGraph from '../components/horizon/TravelGraph'
import type { SavedItem, Category } from '../types'

/**
 * Temporary test route for visual testing of the Travel Graph.
 * Access at /graph-test (dev only).
 */

function mockItem(
  id: string,
  title: string,
  city: string | null,
  country: string | null,
  cc: string | null,
  category: Category = 'activity',
): SavedItem {
  return {
    id, user_id: 'u1', source_type: 'manual', source_url: null,
    image_url: null, places_photo_url: null, title, description: null,
    site_name: null,
    location_name: city ? `${city}, ${country}` : null,
    location_lat: city ? 35 + Math.random() * 10 : null,
    location_lng: city ? 130 + Math.random() * 20 : null,
    location_place_id: null, location_country: country, location_country_code: cc,
    location_name_en: null, location_name_local: null,
    category, notes: null, tags: null, is_archived: false,
    image_display: 'none', image_source: null,
    image_credit_name: null, image_credit_url: null,
    image_options: null, image_option_index: null,
    first_viewed_at: null, left_recent: false,
    location_locked: false, location_precision: city ? 'city' : null,
    has_pending_extraction: false,
    source_title: null,
    source_thumbnail: null,
    source_author: null,
    source_platform: null,
    enrichment_source: null,
    photo_attribution: null,
    created_at: new Date().toISOString(),
  }
}

const MOCK_ITEMS: SavedItem[] = [
  // Tokyo cluster (5)
  mockItem('t1', 'Shibuya Crossing', 'Tokyo', 'Japan', 'JP'),
  mockItem('t2', 'Tsukiji Outer Market', 'Tokyo', 'Japan', 'JP', 'restaurant'),
  mockItem('t3', 'TeamLab Borderless', 'Tokyo', 'Japan', 'JP'),
  mockItem('t4', 'Meiji Shrine', 'Tokyo', 'Japan', 'JP'),
  mockItem('t5', 'Ichiran Ramen', 'Tokyo', 'Japan', 'JP', 'restaurant'),
  // Kyoto cluster (3)
  mockItem('k1', 'Fushimi Inari', 'Kyoto', 'Japan', 'JP'),
  mockItem('k2', 'Kinkaku-ji', 'Kyoto', 'Japan', 'JP'),
  mockItem('k3', 'Arashiyama Bamboo', 'Kyoto', 'Japan', 'JP'),
  // Taipei cluster (4)
  mockItem('tw1', 'Shilin Night Market', 'Taipei', 'Taiwan', 'TW', 'restaurant'),
  mockItem('tw2', 'Taipei 101', 'Taipei', 'Taiwan', 'TW'),
  mockItem('tw3', 'Jiufen Old Street', 'Taipei', 'Taiwan', 'TW'),
  mockItem('tw4', 'Din Tai Fung', 'Taipei', 'Taiwan', 'TW', 'restaurant'),
  // Bangkok cluster (3)
  mockItem('bk1', 'Chatuchak Market', 'Bangkok', 'Thailand', 'TH'),
  mockItem('bk2', 'Wat Pho', 'Bangkok', 'Thailand', 'TH'),
  mockItem('bk3', 'Khao San Road', 'Bangkok', 'Thailand', 'TH'),
  // Shanghai (2)
  mockItem('sh1', 'The Bund', 'Shanghai', 'China', 'CN'),
  mockItem('sh2', 'Yu Garden', 'Shanghai', 'China', 'CN'),
  // Beijing (2)
  mockItem('bj1', 'Great Wall', 'Beijing', 'China', 'CN'),
  mockItem('bj2', 'Forbidden City', 'Beijing', 'China', 'CN'),
  // Chengdu (2)
  mockItem('cd1', 'Panda Base', 'Chengdu', 'China', 'CN'),
  mockItem('cd2', 'Hot Pot Street', 'Chengdu', 'China', 'CN', 'restaurant'),
  // Orphans (no location)
  mockItem('o1', 'Packing list', null, null, null, 'general'),
  mockItem('o2', 'Visa notes', null, null, null, 'general'),
  // Solo items (unique locations)
  mockItem('s1', 'Angkor Wat', 'Siem Reap', 'Cambodia', 'KH'),
  mockItem('s2', 'Ha Long Bay', 'Hanoi', 'Vietnam', 'VN'),
]

const claimed = new Set(['t1', 't2', 'k1', 'tw1'])

let addCounter = 0

export default function GraphTestPage() {
  const [items, setItems] = useState<SavedItem[]>(MOCK_ITEMS)

  const addSave = () => {
    addCounter++
    const cities = ['Seoul', 'Osaka', 'Hanoi', 'Singapore', 'Manila']
    const city = cities[addCounter % cities.length]
    const newItem = mockItem(
      `new-${addCounter}`,
      `New place in ${city} #${addCounter}`,
      city,
      city === 'Seoul' ? 'South Korea' : city === 'Osaka' ? 'Japan' : city === 'Hanoi' ? 'Vietnam' : city === 'Singapore' ? 'Singapore' : 'Philippines',
      city === 'Seoul' ? 'KR' : city === 'Osaka' ? 'JP' : city === 'Hanoi' ? 'VN' : city === 'Singapore' ? 'SG' : 'PH',
    )
    setItems(prev => [...prev, newItem])
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <SunsetBackground saveCount={items.length} />
      <div style={{ position: 'relative', zIndex: 1, padding: '20px 0' }}>
        <div style={{ padding: '0 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ color: 'var(--color-night-text-primary)', fontSize: 24, fontWeight: 600, margin: 0 }}>
              Graph Test
            </h1>
            <p style={{ color: 'var(--color-night-text-secondary)', fontSize: 13, marginTop: 4 }}>
              {items.length} items, {claimed.size} claimed by trips
            </p>
          </div>
          <button
            onClick={addSave}
            style={{
              background: '#c45a2d', color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Add Save
          </button>
        </div>
        <TravelGraph
          savedItems={items}
          claimedItemIds={claimed}
        />
      </div>
    </div>
  )
}
