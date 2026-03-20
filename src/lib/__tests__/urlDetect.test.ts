import { describe, it, expect } from 'vitest'
import { detectUrl } from '../urlDetect'

describe('detectUrl', () => {
  it('detects https URL', () => {
    expect(detectUrl('https://www.tiktok.com/video/123')).toBe('https://www.tiktok.com/video/123')
  })

  it('detects http URL', () => {
    expect(detectUrl('http://example.com')).toBe('http://example.com')
  })

  it('detects bare domain with known TLD and prepends https', () => {
    expect(detectUrl('instagram.com/p/abc')).toBe('https://instagram.com/p/abc')
  })

  it('detects bare domain with path', () => {
    expect(detectUrl('tiktok.com/@user/video')).toBe('https://tiktok.com/@user/video')
  })

  it('detects domain with various TLDs', () => {
    expect(detectUrl('example.org')).toBe('https://example.org')
    expect(detectUrl('mysite.io')).toBe('https://mysite.io')
    expect(detectUrl('app.dev')).toBe('https://app.dev')
  })

  it('returns null for plain text', () => {
    expect(detectUrl('Amazing ramen spot')).toBeNull()
  })

  it('returns null for fake TLD', () => {
    expect(detectUrl('food.good')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(detectUrl('')).toBeNull()
  })

  it('returns null for whitespace only', () => {
    expect(detectUrl('   ')).toBeNull()
  })

  it('handles URL with leading/trailing whitespace', () => {
    expect(detectUrl('  https://example.com  ')).toBe('https://example.com')
  })
})
