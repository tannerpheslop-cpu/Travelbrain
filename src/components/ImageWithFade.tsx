import { useState, useRef, useEffect } from 'react'
import { optimizedImageUrl, type ImageContext } from '../lib/optimizedImage'

interface ImageWithFadeProps {
  src: string | null
  alt?: string
  className?: string
  style?: React.CSSProperties
  context?: ImageContext
  /** If true, load eagerly (above the fold). Otherwise lazy-load on scroll. */
  eager?: boolean
  /** Called when image fails to load */
  onError?: () => void
  /** Called when image successfully loads */
  onLoad?: () => void
}

/**
 * Shared image component with:
 * - Automatic Unsplash URL optimisation via optimizedImageUrl
 * - Smooth fade-in (opacity 0 → 1 over 0.2s)
 * - Eager / lazy loading control
 * - Handles already-cached images (checks img.complete on mount)
 * - Resets error/loaded state when src changes
 *
 * Returns null when src is falsy or the image errors, letting the parent
 * render its own fallback.
 */
export default function ImageWithFade({
  src,
  alt = '',
  className,
  style,
  context = 'gallery-card',
  eager = false,
  onError: onErrorProp,
  onLoad: onLoadProp,
}: ImageWithFadeProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  const optimizedSrc = optimizedImageUrl(src, context)

  // Reset loaded/error state when src changes, then check if already cached
  useEffect(() => {
    setLoaded(false)
    setError(false)

    // Use requestAnimationFrame to ensure the new <img> has mounted with the new src
    requestAnimationFrame(() => {
      if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
        setLoaded(true)
      }
    })
  }, [optimizedSrc])

  if (error || !optimizedSrc) return null

  return (
    <img
      ref={imgRef}
      src={optimizedSrc}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      onLoad={() => {
        setLoaded(true)
        onLoadProp?.()
      }}
      onError={() => {
        setError(true)
        onErrorProp?.()
      }}
      style={{
        opacity: loaded ? 1 : 0,
        transition: 'opacity 0.2s ease',
        ...style,
      }}
    />
  )
}
