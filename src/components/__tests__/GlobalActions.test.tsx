import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GlobalActions from '../GlobalActions'

// Mock CreatePopover to avoid rendering its full tree
vi.mock('../CreatePopover', () => ({
  default: () => <div data-testid="create-popover" />,
}))

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GlobalActions />
    </MemoryRouter>,
  )
}

describe('GlobalActions FAB visibility', () => {
  it('shows FAB on /inbox', () => {
    renderAtRoute('/inbox')
    expect(screen.getByRole('button', { name: 'Add save' })).toBeInTheDocument()
  })

  it('shows FAB on /trips', () => {
    renderAtRoute('/trips')
    expect(screen.getByRole('button', { name: 'Add save' })).toBeInTheDocument()
  })

  it('shows FAB on /search', () => {
    renderAtRoute('/search')
    expect(screen.getByRole('button', { name: 'Add save' })).toBeInTheDocument()
  })

  it('shows FAB on /profile', () => {
    renderAtRoute('/profile')
    expect(screen.getByRole('button', { name: 'Add save' })).toBeInTheDocument()
  })

  it('hides FAB on /trip/:id (trip detail)', () => {
    renderAtRoute('/trip/trip-123')
    expect(screen.queryByRole('button', { name: 'Add save' })).not.toBeInTheDocument()
  })

  it('hides FAB on /trip/:id/dest/:destId (destination detail)', () => {
    renderAtRoute('/trip/trip-123/dest/dest-456')
    expect(screen.queryByRole('button', { name: 'Add save' })).not.toBeInTheDocument()
  })

  it('hides FAB on /trip/:id/route/:routeId (route overview)', () => {
    renderAtRoute('/trip/trip-123/route/route-789')
    expect(screen.queryByRole('button', { name: 'Add save' })).not.toBeInTheDocument()
  })

  it('hides FAB on /item/:id (item detail)', () => {
    renderAtRoute('/item/item-123')
    expect(screen.queryByRole('button', { name: 'Add save' })).not.toBeInTheDocument()
  })
})
