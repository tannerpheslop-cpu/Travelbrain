import { describe, it, expect } from 'vitest'
import { lightMapStyle, darkMapStyle } from '../../components/map/mapStyles'

describe('Map styles — light mode', () => {
  it('uses the correct water color (#f0eeea)', () => {
    const waterRule = lightMapStyle.find(
      (r) => r.featureType === 'water' && r.elementType === 'geometry',
    )
    expect(waterRule).toBeDefined()
    expect(waterRule!.stylers).toContainEqual({ color: '#f0eeea' })
  })

  it('hides POI icons', () => {
    const poiRule = lightMapStyle.find(
      (r) => r.featureType === 'poi' && !r.elementType,
    )
    expect(poiRule).toBeDefined()
    expect(poiRule!.stylers).toContainEqual({ visibility: 'off' })
  })
})

describe('Map styles — dark mode', () => {
  it('uses the correct water color (#242320)', () => {
    const waterRule = darkMapStyle.find(
      (r) => r.featureType === 'water' && r.elementType === 'geometry',
    )
    expect(waterRule).toBeDefined()
    expect(waterRule!.stylers).toContainEqual({ color: '#242320' })
  })

  it('hides POI icons', () => {
    const poiRule = darkMapStyle.find(
      (r) => r.featureType === 'poi' && !r.elementType,
    )
    expect(poiRule).toBeDefined()
    expect(poiRule!.stylers).toContainEqual({ visibility: 'off' })
  })
})
