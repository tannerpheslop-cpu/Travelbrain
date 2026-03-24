import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div
      className="px-5 pb-24 flex flex-col items-center justify-center"
      style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))', minHeight: '60vh' }}
      data-testid="not-found-page"
    >
      <p
        className="text-text-tertiary font-medium text-lg"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        Page not found
      </p>
      <p
        className="mt-2 text-sm text-text-faint text-center"
        style={{ fontFamily: "'DM Sans', sans-serif", maxWidth: 280 }}
      >
        The page you're looking for doesn't exist.
      </p>
      <Link
        to="/inbox"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        style={{
          fontFamily: "'DM Sans', sans-serif",
          background: 'var(--color-accent)',
          color: '#ffffff',
        }}
      >
        Go to Horizon
      </Link>
    </div>
  )
}
