import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockSignOut = vi.fn().mockResolvedValue(undefined)
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: 'test@example.com',
      user_metadata: { full_name: 'Test User' },
    },
    signOut: mockSignOut,
  }),
}))

const mockDelete = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }),
  in: vi.fn().mockResolvedValue({ error: null }),
})
const mockSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    data: [{ id: 'trip-1' }],
    error: null,
  }),
  in: vi.fn().mockResolvedValue({ data: [{ id: 'dest-1' }], error: null }),
})

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      delete: mockDelete,
      select: mockSelect,
    })),
  },
}))

import ProfilePage from '../ProfilePage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <ProfilePage />
    </MemoryRouter>,
  )
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders user info', () => {
    renderPage()
    expect(screen.getByText('Test User')).toBeTruthy()
    expect(screen.getByText('test@example.com')).toBeTruthy()
  })

  it('renders Delete Account button', () => {
    renderPage()
    expect(screen.getByText('Delete Account')).toBeTruthy()
  })

  it('shows first confirmation modal when Delete Account is clicked', async () => {
    renderPage()
    await userEvent.click(screen.getByText('Delete Account'))
    expect(screen.getByText('Delete your account?')).toBeTruthy()
    expect(screen.getByText('Continue')).toBeTruthy()
  })

  it('closes first modal on Cancel', async () => {
    renderPage()
    await userEvent.click(screen.getByText('Delete Account'))
    expect(screen.getByText('Delete your account?')).toBeTruthy()
    await userEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Delete your account?')).toBeNull()
  })

  it('shows type-DELETE modal after Continue', async () => {
    renderPage()
    await userEvent.click(screen.getByText('Delete Account'))
    await userEvent.click(screen.getByText('Continue'))
    expect(screen.getByText('Are you sure?')).toBeTruthy()
    expect(screen.getByPlaceholderText('Type DELETE')).toBeTruthy()
  })

  it('disables Delete button until DELETE is typed', async () => {
    renderPage()
    await userEvent.click(screen.getByText('Delete Account'))
    await userEvent.click(screen.getByText('Continue'))
    const deleteBtn = screen.getByText('Delete my account')
    expect(deleteBtn).toBeDisabled()
    const input = screen.getByPlaceholderText('Type DELETE')
    await userEvent.type(input, 'DELETE')
    expect(deleteBtn).not.toBeDisabled()
  })

  it('does not enable button for wrong text', async () => {
    renderPage()
    await userEvent.click(screen.getByText('Delete Account'))
    await userEvent.click(screen.getByText('Continue'))
    const input = screen.getByPlaceholderText('Type DELETE')
    await userEvent.type(input, 'delete') // lowercase
    expect(screen.getByText('Delete my account')).toBeDisabled()
  })

  it('closes type-DELETE modal on Escape', async () => {
    renderPage()
    await userEvent.click(screen.getByText('Delete Account'))
    await userEvent.click(screen.getByText('Continue'))
    expect(screen.getByText('Are you sure?')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Are you sure?')).toBeNull()
  })

  it('calls signOut on Log Out button', async () => {
    renderPage()
    await userEvent.click(screen.getByText('Log Out'))
    expect(mockSignOut).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })
})
