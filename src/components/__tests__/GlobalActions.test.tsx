import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GlobalActions from '../GlobalActions'

// Mock SaveSheet to avoid rendering its full tree (Supabase, Google Maps, etc.)
vi.mock('../SaveSheet', () => ({
  default: (props: { onClose: () => void }) => (
    <div data-testid="save-sheet">
      <input placeholder="Type a note, paste a link..." />
      <button onClick={props.onClose}>Close</button>
    </div>
  ),
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

describe('GlobalActions FAB opens unified save sheet', () => {
  it('opens SaveSheet directly when FAB is tapped (not a menu)', () => {
    renderAtRoute('/inbox')

    // Verify save sheet is NOT visible before clicking
    expect(screen.queryByTestId('save-sheet')).not.toBeInTheDocument()

    // Click FAB
    fireEvent.click(screen.getByRole('button', { name: 'Add save' }))

    // Verify save sheet opens directly — input field visible, not a menu
    expect(screen.getByTestId('save-sheet')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Type a note, paste a link...')).toBeInTheDocument()
  })

  it('does NOT show "Save a link", "Photo", or "Add places" menu options', () => {
    renderAtRoute('/inbox')
    fireEvent.click(screen.getByRole('button', { name: 'Add save' }))

    // These old menu options should NOT exist
    expect(screen.queryByText('Save a link')).not.toBeInTheDocument()
    expect(screen.queryByText('Photo')).not.toBeInTheDocument()
    expect(screen.queryByText('Add places')).not.toBeInTheDocument()
  })

  it('changes FAB aria-label to Close when sheet is open', () => {
    renderAtRoute('/inbox')
    fireEvent.click(screen.getByRole('button', { name: 'Add save' }))

    // FAB label should change — use aria-label which is on the FAB specifically
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
  })

  it('closes save sheet when FAB is tapped again', () => {
    renderAtRoute('/inbox')

    // Open
    fireEvent.click(screen.getByRole('button', { name: 'Add save' }))
    expect(screen.getByTestId('save-sheet')).toBeInTheDocument()

    // Close via FAB toggle (use aria-label to target the FAB specifically)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(screen.queryByTestId('save-sheet')).not.toBeInTheDocument()
  })
})
