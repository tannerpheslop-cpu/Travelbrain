import { describe, it, expect, vi } from 'vitest'
import { buildMarkerHTML } from '../../components/map/MapMarker'

describe('MapMarker', () => {
  it('renders with correct chapter number and city name', () => {
    const html = buildMarkerHTML(3, 'Kyoto', false)
    expect(html).toContain('03')
    expect(html).toContain('Kyoto')
  })

  it('applies light mode styles when theme is light', () => {
    const html = buildMarkerHTML(1, 'Tokyo', false)
    expect(html).toContain('rgba(255, 255, 255, 0.94)')
    expect(html).toContain('#555350')
  })

  it('applies dark mode styles when theme is dark', () => {
    const html = buildMarkerHTML(2, 'Osaka', true)
    expect(html).toContain('rgba(36, 35, 32, 0.95)')
    expect(html).toContain('#e8e6e1')
  })

  it('click handler fires on marker container', () => {
    const onClick = vi.fn()
    const container = document.createElement('div')
    container.innerHTML = buildMarkerHTML(4, 'Hiroshima', false)
    container.addEventListener('click', onClick)
    document.body.appendChild(container)

    container.click()
    expect(onClick).toHaveBeenCalledTimes(1)

    container.remove()
  })

  it('shows copper dot color (#c45a2d)', () => {
    const html = buildMarkerHTML(5, 'Fukuoka', false)
    expect(html).toContain('#c45a2d')
  })
})
