import { useState, useEffect } from 'react'

interface ScrollToTopProps {
  /** Distance from bottom in px (above bottom nav). Default 80. */
  bottom?: number
}

export default function ScrollToTop({ bottom = 80 }: ScrollToTopProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const threshold = window.innerHeight * 2

    const handleScroll = () => {
      setVisible(window.scrollY > threshold)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll to top"
      className="fixed z-30 transition-opacity duration-200"
      style={{
        bottom,
        right: 20,
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: '#ffffff',
        border: '1px solid var(--color-border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        cursor: 'pointer',
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        style={{ width: 16, height: 16, color: 'var(--color-text-secondary)' }}
      >
        <path
          fillRule="evenodd"
          d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  )
}
