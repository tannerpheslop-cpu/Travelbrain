import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center px-6"
          style={{ minHeight: '100vh', background: 'var(--color-bg-page)' }}
          data-testid="error-boundary-fallback"
        >
          <p
            className="text-lg font-medium"
            style={{ fontFamily: "'DM Sans', sans-serif", color: 'var(--color-text-primary)' }}
          >
            Something went wrong
          </p>
          <p
            className="mt-2 text-sm text-center"
            style={{ fontFamily: "'DM Sans', sans-serif", color: 'var(--color-text-tertiary)', maxWidth: 280 }}
          >
            An unexpected error occurred. Please try again.
          </p>
          <a
            href="/"
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              background: 'var(--color-accent)',
              color: '#ffffff',
            }}
          >
            Go Home
          </a>
        </div>
      )
    }

    return this.props.children
  }
}
