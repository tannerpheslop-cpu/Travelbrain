import { describe, it, expect } from 'vitest'
import { evaluateImageDisplay } from '../evaluateImageDisplay'

describe('evaluateImageDisplay', () => {
  it('returns "none" when image_url is null', () => {
    expect(evaluateImageDisplay({ image_url: null })).toBe('none')
  })

  it('returns "none" when image_url is empty string', () => {
    expect(evaluateImageDisplay({ image_url: '' })).toBe('none')
  })

  it('returns "none" when image_url is whitespace-only', () => {
    expect(evaluateImageDisplay({ image_url: '   ' })).toBe('none')
  })

  it('returns "thumbnail" for any non-empty image_url', () => {
    expect(evaluateImageDisplay({ image_url: 'https://example.com/photo.jpg' })).toBe('thumbnail')
  })

  it('returns "thumbnail" for Supabase Storage image (user upload)', () => {
    expect(evaluateImageDisplay({
      image_url: 'https://xyzproject.supabase.co/storage/v1/object/public/screenshots/abc.jpg',
    })).toBe('thumbnail')
  })

  it('returns "thumbnail" for OG metadata image', () => {
    expect(evaluateImageDisplay({
      image_url: 'https://myblog.com/og-image.jpg',
    })).toBe('thumbnail')
  })
})
