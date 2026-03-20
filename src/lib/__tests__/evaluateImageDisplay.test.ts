import { describe, it, expect } from 'vitest'
import { evaluateImageDisplay } from '../evaluateImageDisplay'

describe('evaluateImageDisplay', () => {
  it('returns "none" when image_url is null and places_photo_url is null', () => {
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

  it('returns "thumbnail" for Supabase Storage image', () => {
    expect(evaluateImageDisplay({
      image_url: 'https://xyzproject.supabase.co/storage/v1/object/public/screenshots/abc.jpg',
    })).toBe('thumbnail')
  })

  it('returns "thumbnail" for Unsplash image', () => {
    expect(evaluateImageDisplay({
      image_url: 'https://images.unsplash.com/photo-abc',
    })).toBe('thumbnail')
  })

  it('returns "thumbnail" for manual entry with any image URL', () => {
    expect(evaluateImageDisplay({
      image_url: 'https://myblog.com/random-photo.jpg',
    })).toBe('thumbnail')
  })

  it('returns "thumbnail" when image_url is null but places_photo_url is set', () => {
    expect(evaluateImageDisplay({
      image_url: null,
      places_photo_url: 'https://maps.googleapis.com/photo/abc',
    })).toBe('thumbnail')
  })

  it('returns "none" when places_photo_url is empty string', () => {
    expect(evaluateImageDisplay({
      image_url: null,
      places_photo_url: '',
    })).toBe('none')
  })

  it('returns "thumbnail" when both image_url and places_photo_url are set', () => {
    expect(evaluateImageDisplay({
      image_url: 'https://example.com/photo.jpg',
      places_photo_url: 'https://maps.googleapis.com/photo/abc',
    })).toBe('thumbnail')
  })
})
