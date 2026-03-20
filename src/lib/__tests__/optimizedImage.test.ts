import { describe, it, expect } from 'vitest'
import { optimizedImageUrl, cleanUnsplashUrl } from '../optimizedImage'

// ── cleanUnsplashUrl ─────────────────────────────────────────────────────────

describe('cleanUnsplashUrl', () => {
  it('strips sizing params from an Unsplash URL', () => {
    const dirty = 'https://images.unsplash.com/photo-abc?ixid=123&w=800&h=400&q=80&fit=crop&crop=center&auto=format'
    const clean = cleanUnsplashUrl(dirty)
    expect(clean).toBe('https://images.unsplash.com/photo-abc?ixid=123')
    expect(clean).not.toContain('w=')
    expect(clean).not.toContain('h=')
    expect(clean).not.toContain('q=')
    expect(clean).not.toContain('fit=')
    expect(clean).not.toContain('crop=')
    expect(clean).not.toContain('auto=')
  })

  it('returns URL unchanged if no sizing params present', () => {
    const url = 'https://images.unsplash.com/photo-abc?ixid=123'
    expect(cleanUnsplashUrl(url)).toBe(url)
  })

  it('returns non-Unsplash URLs unchanged', () => {
    const url = 'https://example.com/photo.jpg?w=800'
    expect(cleanUnsplashUrl(url)).toBe(url)
  })

  it('returns invalid URLs unchanged', () => {
    const bad = 'not-a-url-unsplash.com'
    expect(cleanUnsplashUrl(bad)).toBe(bad)
  })

  it('handles Unsplash URL with only sizing params (no other params)', () => {
    const url = 'https://images.unsplash.com/photo-abc?w=400&h=300'
    const clean = cleanUnsplashUrl(url)
    expect(clean).toBe('https://images.unsplash.com/photo-abc')
  })
})

// ── optimizedImageUrl ────────────────────────────────────────────────────────

describe('optimizedImageUrl', () => {
  it('returns null for null input', () => {
    expect(optimizedImageUrl(null, 'grid-thumbnail')).toBeNull()
  })

  it('returns non-Unsplash URLs unchanged', () => {
    const url = 'https://example.com/photo.jpg'
    expect(optimizedImageUrl(url, 'grid-thumbnail')).toBe(url)
  })

  it('appends grid-thumbnail sizing params to Unsplash URL', () => {
    const url = 'https://images.unsplash.com/photo-abc'
    const result = optimizedImageUrl(url, 'grid-thumbnail')!
    expect(result).toContain('w=112')
    expect(result).toContain('h=112')
    expect(result).toContain('q=80')
    expect(result).toContain('fit=crop')
    expect(result).toContain('auto=format')
  })

  it('appends gallery-card sizing params to Unsplash URL', () => {
    const url = 'https://images.unsplash.com/photo-abc'
    const result = optimizedImageUrl(url, 'gallery-card')!
    expect(result).toContain('w=340')
    expect(result).toContain('h=340')
    expect(result).toContain('q=80')
  })

  it('appends hero-card sizing (no height) to Unsplash URL', () => {
    const url = 'https://images.unsplash.com/photo-abc'
    const result = optimizedImageUrl(url, 'hero-card')!
    expect(result).toContain('w=800')
    expect(result).toContain('q=80')
    expect(result).not.toContain('h=')
    expect(result).not.toContain('fit=')
  })

  it('appends detail-page sizing (no height) to Unsplash URL', () => {
    const url = 'https://images.unsplash.com/photo-abc'
    const result = optimizedImageUrl(url, 'detail-page')!
    expect(result).toContain('w=600')
    expect(result).toContain('q=85')
    expect(result).not.toContain('h=')
  })

  it('does not double-append sizing params if already present', () => {
    const dirty = 'https://images.unsplash.com/photo-abc?w=999&h=999&q=50&fit=crop'
    const result = optimizedImageUrl(dirty, 'grid-thumbnail')!
    // Should have exactly one w= param with the correct value
    expect(result).toContain('w=112')
    expect(result).not.toContain('w=999')
  })

  it('preserves non-sizing query params on Unsplash URLs', () => {
    const url = 'https://images.unsplash.com/photo-abc?ixid=MnwxMjA3fDB&ixlib=rb-4.0.3'
    const result = optimizedImageUrl(url, 'gallery-card')!
    expect(result).toContain('ixid=MnwxMjA3fDB')
    expect(result).toContain('ixlib=rb-4.0.3')
    expect(result).toContain('w=340')
  })

  it('appends destination-card sizing to Unsplash URL', () => {
    const url = 'https://images.unsplash.com/photo-abc'
    const result = optimizedImageUrl(url, 'destination-card')!
    expect(result).toContain('w=480')
    expect(result).toContain('q=80')
  })

  it('appends featured-card sizing with height to Unsplash URL', () => {
    const url = 'https://images.unsplash.com/photo-abc'
    const result = optimizedImageUrl(url, 'featured-card')!
    expect(result).toContain('w=800')
    expect(result).toContain('h=240')
    expect(result).toContain('fit=crop')
  })
})
