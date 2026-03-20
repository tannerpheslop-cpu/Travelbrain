import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BilingualName, { shortName, shortLocalName } from '../BilingualName'

// ── Component tests ──────────────────────────────────────────────────────────

describe('BilingualName component', () => {
  it('renders just the name when nameLocal is null', () => {
    render(<BilingualName name="Tokyo, Japan" nameLocal={null} />)
    expect(screen.getByText('Tokyo, Japan')).toBeInTheDocument()
  })

  it('renders just the name when nameLocal matches name (deduplication)', () => {
    render(<BilingualName name="Paris" nameLocal="Paris" />)
    // Should only render once — no duplicate subtitle
    const spans = document.querySelectorAll('span')
    expect(spans).toHaveLength(1)
    expect(spans[0].textContent).toBe('Paris')
  })

  it('renders name + local name when they differ (inline mode)', () => {
    render(<BilingualName name="Tokyo, Japan" nameLocal="東京都, 日本" />)
    expect(screen.getByText('東京都, 日本')).toBeInTheDocument()
    // Local name should have inline styling (ml-1.5)
    const localSpan = screen.getByText('東京都, 日本')
    expect(localSpan.className).toContain('ml-1.5')
  })

  it('renders local name on a separate line in block mode', () => {
    render(<BilingualName name="Tokyo" nameLocal="東京都" block />)
    const localSpan = screen.getByText('東京都')
    expect(localSpan.className).toContain('block')
  })

  it('applies className to wrapper span', () => {
    render(<BilingualName name="Tokyo" className="text-lg font-bold" />)
    const wrapper = screen.getByText('Tokyo')
    expect(wrapper.className).toContain('text-lg')
    expect(wrapper.className).toContain('font-bold')
  })

  it('applies localClassName to local name span', () => {
    render(<BilingualName name="Tokyo" nameLocal="東京都" localClassName="text-red-500" />)
    const localSpan = screen.getByText('東京都')
    expect(localSpan.className).toContain('text-red-500')
  })

  it('does not show local name when nameLocal is empty string', () => {
    render(<BilingualName name="Tokyo" nameLocal="" />)
    const spans = document.querySelectorAll('span')
    expect(spans).toHaveLength(1)
  })
})

// ── Utility function tests ───────────────────────────────────────────────────

describe('shortName', () => {
  it('extracts city from "Tokyo, Japan"', () => {
    expect(shortName('Tokyo, Japan')).toBe('Tokyo')
  })

  it('extracts city from multi-part name "Chengdu, Sichuan, China"', () => {
    expect(shortName('Chengdu, Sichuan, China')).toBe('Chengdu')
  })

  it('returns full name when no comma', () => {
    expect(shortName('Paris')).toBe('Paris')
  })

  it('returns empty string for null', () => {
    expect(shortName(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(shortName(undefined)).toBe('')
  })

  it('trims whitespace', () => {
    expect(shortName('  Tokyo , Japan')).toBe('Tokyo')
  })
})

describe('shortLocalName', () => {
  it('extracts first part from "東京都, 日本"', () => {
    expect(shortLocalName('東京都, 日本')).toBe('東京都')
  })

  it('returns full name when no comma', () => {
    expect(shortLocalName('パリ')).toBe('パリ')
  })

  it('returns null for null input', () => {
    expect(shortLocalName(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(shortLocalName(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(shortLocalName('')).toBeNull()
  })

  it('trims whitespace', () => {
    expect(shortLocalName('  成都 , 中国')).toBe('成都')
  })
})
