import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import NotFoundPage from '../../pages/NotFoundPage'

describe('BUG-004 regression: unknown routes show blank page', () => {
  it('renders "Page not found" for an unknown route', () => {
    render(
      <MemoryRouter initialEntries={['/some-nonexistent-route']}>
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Page not found')).toBeInTheDocument()
    expect(
      screen.getByText("The page you're looking for doesn't exist."),
    ).toBeInTheDocument()
  })

  it('provides a link back to the Horizon', () => {
    render(
      <MemoryRouter initialEntries={['/totally-random-page']}>
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const link = screen.getByText('Go to Horizon')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/inbox')
  })
})
