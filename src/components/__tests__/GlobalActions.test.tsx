import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
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

  it('hides FAB on /trips', () => {
    renderAtRoute('/trips')
    expect(screen.queryByRole('button', { name: 'Add save' })).not.toBeInTheDocument()
  })

  it('hides FAB on /search', () => {
    renderAtRoute('/search')
    expect(screen.queryByRole('button', { name: 'Add save' })).not.toBeInTheDocument()
  })

  it('hides FAB on /profile', () => {
    renderAtRoute('/profile')
    expect(screen.queryByRole('button', { name: 'Add save' })).not.toBeInTheDocument()
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

describe('GlobalActions FAB menu', () => {
  it('opens two-option menu when FAB is tapped', () => {
    renderAtRoute('/inbox')
    fireEvent.click(screen.getByRole('button', { name: 'Add save' }))

    expect(screen.getByText('Quick save')).toBeInTheDocument()
    expect(screen.getByText('Unpack')).toBeInTheDocument()
  })

  it('shows descriptions for both options', () => {
    renderAtRoute('/inbox')
    fireEvent.click(screen.getByRole('button', { name: 'Add save' }))

    expect(screen.getByText('Save a link, note, or photo')).toBeInTheDocument()
    expect(screen.getByText('Extract places from an article or video')).toBeInTheDocument()
  })

  it('"Quick save" opens the existing SaveSheet', async () => {
    vi.useFakeTimers()
    renderAtRoute('/inbox')

    // Open menu
    fireEvent.click(screen.getByRole('button', { name: 'Add save' }))
    expect(screen.getByText('Quick save')).toBeInTheDocument()

    // Tap Quick save
    fireEvent.click(screen.getByText('Quick save'))

    // Wait for the setTimeout delay
    act(() => { vi.advanceTimersByTime(100) })

    // Save sheet should now be open
    expect(screen.getByTestId('save-sheet')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Type a note, paste a link...')).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('"Unpack" logs to console (placeholder)', () => {
    const consoleSpy = vi.spyOn(console, 'log')
    renderAtRoute('/inbox')

    fireEvent.click(screen.getByRole('button', { name: 'Add save' }))
    fireEvent.click(screen.getByText('Unpack'))

    expect(consoleSpy).toHaveBeenCalledWith('Unpack tapped')
    consoleSpy.mockRestore()
  })

  it('does NOT show old menu options (Save a link, Photo, Add places)', () => {
    renderAtRoute('/inbox')
    fireEvent.click(screen.getByRole('button', { name: 'Add save' }))

    expect(screen.queryByText('Save a link')).not.toBeInTheDocument()
    expect(screen.queryByText('Photo')).not.toBeInTheDocument()
    expect(screen.queryByText('Add places')).not.toBeInTheDocument()
  })

  it('FAB closes menu when tapped again', () => {
    renderAtRoute('/inbox')

    // Open menu
    fireEvent.click(screen.getByRole('button', { name: 'Add save' }))
    expect(screen.getByText('Quick save')).toBeInTheDocument()

    // Tap FAB again (now shows Close label)
    fireEvent.click(screen.getByLabelText('Close'))

    // Menu should be gone
    expect(screen.queryByText('Quick save')).not.toBeInTheDocument()
  })
})
