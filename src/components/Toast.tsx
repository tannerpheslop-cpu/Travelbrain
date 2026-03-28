import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'

// ── Context ──────────────────────────────────────────────────────────────────

interface ToastContextType {
  toast: (message: string) => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toast = useCallback((msg: string) => {
    // Clear any existing timer
    if (timerRef.current) clearTimeout(timerRef.current)
    setMessage(msg)
    timerRef.current = setTimeout(() => setMessage(null), 2000)
  }, [])

  // Clean up timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {message && <ToastPill message={message} />}
    </ToastContext.Provider>
  )
}

// ── Pill component ───────────────────────────────────────────────────────────

function ToastPill({ message }: { message: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Slide in after mount
    requestAnimationFrame(() => setVisible(true))
    // Start fade-out before parent removes us
    const fadeTimer = setTimeout(() => setVisible(false), 1700)
    return () => clearTimeout(fadeTimer)
  }, [])

  return (
    <div
      data-testid="toast-pill"
      style={{
        position: 'fixed',
        top: `calc(env(safe-area-inset-top, 0px) + 12px)`,
        left: '50%',
        transform: visible ? 'translate(-50%, 0)' : 'translate(-50%, -20px)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease, transform 200ms ease',
        zIndex: 100,
        background: 'var(--color-surface)',
        color: 'var(--color-star-default)',
        border: '0.5px solid var(--color-surface-elevated)',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: 500,
        padding: '8px 16px',
        borderRadius: 20,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  )
}
