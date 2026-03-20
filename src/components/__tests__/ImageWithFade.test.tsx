import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ImageWithFade from '../ImageWithFade'

// Mock optimizedImageUrl — keep the logic simple for testing
vi.mock('../../lib/optimizedImage', () => ({
  optimizedImageUrl: (url: string | null, _ctx: string) => url,
}))

describe('ImageWithFade', () => {
  it('renders null when src is null', () => {
    const { container } = render(<ImageWithFade src={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders an img element when src is provided', () => {
    render(<ImageWithFade src="https://example.com/photo.jpg" alt="test" />)
    const img = screen.getByAltText('test')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg')
  })

  it('starts with opacity 0', () => {
    render(<ImageWithFade src="https://example.com/photo.jpg" alt="test" />)
    const img = screen.getByAltText('test')
    expect(img.style.opacity).toBe('0')
  })

  it('transitions to opacity 1 on load', () => {
    render(<ImageWithFade src="https://example.com/photo.jpg" alt="test" />)
    const img = screen.getByAltText('test')
    fireEvent.load(img)
    expect(img.style.opacity).toBe('1')
  })

  it('renders null after error', () => {
    const { container } = render(<ImageWithFade src="https://example.com/broken.jpg" alt="test" />)
    const img = screen.getByAltText('test')
    fireEvent.error(img)
    // After error, component should return null
    expect(container.querySelector('img')).toBeNull()
  })

  it('calls onError callback on image error', () => {
    const onError = vi.fn()
    render(<ImageWithFade src="https://example.com/broken.jpg" alt="test" onError={onError} />)
    fireEvent.error(screen.getByAltText('test'))
    expect(onError).toHaveBeenCalledOnce()
  })

  it('calls onLoad callback on image load', () => {
    const onLoad = vi.fn()
    render(<ImageWithFade src="https://example.com/photo.jpg" alt="test" onLoad={onLoad} />)
    fireEvent.load(screen.getByAltText('test'))
    expect(onLoad).toHaveBeenCalledOnce()
  })

  it('sets loading="lazy" by default', () => {
    render(<ImageWithFade src="https://example.com/photo.jpg" alt="test" />)
    expect(screen.getByAltText('test')).toHaveAttribute('loading', 'lazy')
  })

  it('sets loading="eager" when eager prop is true', () => {
    render(<ImageWithFade src="https://example.com/photo.jpg" alt="test" eager />)
    expect(screen.getByAltText('test')).toHaveAttribute('loading', 'eager')
  })

  it('applies className to the img element', () => {
    render(<ImageWithFade src="https://example.com/photo.jpg" alt="test" className="w-full h-full object-cover" />)
    expect(screen.getByAltText('test')).toHaveClass('w-full', 'h-full', 'object-cover')
  })

  it('merges custom style with fade styles', () => {
    render(<ImageWithFade src="https://example.com/photo.jpg" alt="test" style={{ borderRadius: 8 }} />)
    const img = screen.getByAltText('test')
    expect(img.style.borderRadius).toBe('8px')
    expect(img.style.opacity).toBe('0')
    expect(img.style.transition).toContain('opacity')
  })

  it('uses default alt="" when alt is not provided', () => {
    render(<ImageWithFade src="https://example.com/photo.jpg" />)
    const img = document.querySelector('img')
    expect(img).toHaveAttribute('alt', '')
  })
})
