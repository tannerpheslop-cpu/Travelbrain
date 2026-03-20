import { describe, it, expect } from 'vitest'
import { evaluateImageDisplay } from '../evaluateImageDisplay'

describe('evaluateImageDisplay', () => {
  const base = { source_type: 'url', image_url: null, site_name: null, category: 'activity' }

  it('returns "none" when image_url is null', () => {
    expect(evaluateImageDisplay({ ...base, image_url: null })).toBe('none')
  })

  it('returns "thumbnail" for manual entry with Supabase Storage image', () => {
    expect(evaluateImageDisplay({
      ...base,
      source_type: 'manual',
      image_url: 'https://xyzproject.supabase.co/storage/v1/object/public/screenshots/abc.jpg',
    })).toBe('thumbnail')
  })

  it('returns "thumbnail" for Unsplash image URL', () => {
    expect(evaluateImageDisplay({
      ...base,
      image_url: 'https://images.unsplash.com/photo-abc',
    })).toBe('thumbnail')
  })

  it('returns "thumbnail" for TikTok OG image', () => {
    expect(evaluateImageDisplay({
      ...base,
      source_type: 'url',
      image_url: 'https://p16.tiktokcdn.com/image.jpg',
      site_name: 'TikTok',
    })).toBe('thumbnail')
  })

  it('returns "thumbnail" for Instagram OG image', () => {
    expect(evaluateImageDisplay({
      ...base,
      source_type: 'url',
      image_url: 'https://scontent.cdninstagram.com/image.jpg',
      site_name: 'Instagram',
    })).toBe('thumbnail')
  })

  it('returns "thumbnail" for YouTube OG image', () => {
    expect(evaluateImageDisplay({
      ...base,
      source_type: 'url',
      image_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      site_name: 'YouTube',
    })).toBe('thumbnail')
  })

  it('returns "thumbnail" for generic URL-sourced item with image', () => {
    expect(evaluateImageDisplay({
      ...base,
      source_type: 'url',
      image_url: 'https://myblog.com/header.jpg',
      site_name: 'My Travel Blog',
    })).toBe('thumbnail')
  })

  it('returns "thumbnail" for URL-sourced item with image but no site_name', () => {
    expect(evaluateImageDisplay({
      ...base,
      source_type: 'url',
      image_url: 'https://example.com/photo.jpg',
      site_name: null,
    })).toBe('thumbnail')
  })

  it('returns "thumbnail" for screenshots', () => {
    expect(evaluateImageDisplay({
      ...base,
      source_type: 'screenshot',
      image_url: 'https://storage.supabase.co/screenshots/shot.png',
    })).toBe('thumbnail')
  })

  it('returns "none" for manual entry without supabase image', () => {
    expect(evaluateImageDisplay({
      ...base,
      source_type: 'manual',
      image_url: 'https://example.com/random.jpg',
    })).toBe('none')
  })

  it('is case-insensitive on site_name matching', () => {
    expect(evaluateImageDisplay({
      ...base,
      source_type: 'url',
      image_url: 'https://img.com/photo.jpg',
      site_name: 'TIKTOK',
    })).toBe('thumbnail')
  })
})
