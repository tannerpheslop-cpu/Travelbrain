import { describe, it, expect } from 'vitest'
import { hasGeographicRelevance } from '../placesTextSearch'

describe('hasGeographicRelevance', () => {
  it('"Seattle" matches result containing Seattle', () => {
    expect(hasGeographicRelevance('Seattle', 'Seattle', 'Seattle, WA, United States', 'Seattle', 'United States')).toBe(true)
  })

  it('"ramen in Shibuya" matches result containing Shibuya', () => {
    expect(hasGeographicRelevance('ramen in Shibuya', 'Tokyo', 'Shibuya, Tokyo, Japan', 'Tokyo', 'Japan')).toBe(true)
  })

  it('"Hiking in Yubeng" matches result containing Yubeng', () => {
    expect(hasGeographicRelevance('Hiking in Yubeng', 'Yubeng', 'Yubeng, Yunnan, China', 'Yubeng', 'China')).toBe(true)
  })

  it('"Kunming" matches result containing Kunming', () => {
    expect(hasGeographicRelevance('Kunming', 'Kunming', 'Kunming, Yunnan, China', 'Kunming', 'China')).toBe(true)
  })

  it('"Great Wall of China" matches result containing China', () => {
    expect(hasGeographicRelevance('Great Wall of China', 'Great Wall', 'Beijing, China', 'Beijing', 'China')).toBe(true)
  })

  it('"Tiger Leaping Gorge" matches result with Tiger Leaping Gorge in name', () => {
    expect(hasGeographicRelevance('Tiger Leaping Gorge', 'Shangri-La Tiger Leaping Gorge', 'Shangri-La, Diqing, Yunnan, China', 'Shangri-La', 'China')).toBe(true)
  })

  it('"Ffyyyggggccff" does NOT match New York', () => {
    expect(hasGeographicRelevance('Ffyyyggggccff', 'New York', 'New York, NY, United States', 'New York', 'United States')).toBe(false)
  })

  it('"example example" does NOT match New York', () => {
    expect(hasGeographicRelevance('example example', 'New York', 'New York, NY, United States', 'New York', 'United States')).toBe(false)
  })

  it('"great restaurant" does NOT match New York', () => {
    expect(hasGeographicRelevance('great restaurant', 'New York', 'New York, NY, United States', 'New York', 'United States')).toBe(false)
  })

  it('"my packing list" does NOT match New York', () => {
    expect(hasGeographicRelevance('my packing list', 'New York', 'New York, NY, United States', 'New York', 'United States')).toBe(false)
  })

  it('"remember to buy sunscreen" does NOT match New York', () => {
    expect(hasGeographicRelevance('remember to buy sunscreen', 'New York', 'New York, NY, United States', 'New York', 'United States')).toBe(false)
  })

  it('rejects input with only short words (< 3 chars)', () => {
    expect(hasGeographicRelevance('go to', 'Tokyo', 'Tokyo, Japan', 'Tokyo', 'Japan')).toBe(false)
  })
})
