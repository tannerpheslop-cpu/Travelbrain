import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../../components/ErrorBoundary'

// Component that throws during render
function ThrowingComponent(): JSX.Element {
  throw new Error('Test explosion')
}

describe('ErrorBoundary catches render errors and shows recovery UI', () => {
  // Suppress React's console.error for expected errors in tests
  const originalError = console.error
  beforeEach(() => {
    console.error = vi.fn()
  })
  afterEach(() => {
    console.error = originalError
  })

  it('shows "Something went wrong" when a child component throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(
      screen.getByText(/An unexpected error occurred/),
    ).toBeInTheDocument()
  })

  it('provides a "Go Home" link that navigates to /', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    )

    const link = screen.getByText('Go Home')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/')
  })

  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div data-testid="healthy-child">Hello</div>
      </ErrorBoundary>,
    )

    expect(screen.getByTestId('healthy-child')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })
})
