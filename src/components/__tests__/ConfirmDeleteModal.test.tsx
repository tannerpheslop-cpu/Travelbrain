import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal'

describe('ConfirmDeleteModal', () => {
  it('renders default title and description', () => {
    render(<ConfirmDeleteModal onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Delete this save?')).toBeInTheDocument()
    expect(screen.getByText(/permanently remove this item/)).toBeInTheDocument()
  })

  it('renders custom title and description', () => {
    render(
      <ConfirmDeleteModal
        title="Delete this trip?"
        description="All destinations and items will be removed."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('Delete this trip?')).toBeInTheDocument()
    expect(screen.getByText(/All destinations and items/)).toBeInTheDocument()
  })

  it('renders custom button labels', () => {
    render(
      <ConfirmDeleteModal
        confirmLabel="Yes, delete"
        cancelLabel="Go back"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('Yes, delete')).toBeInTheDocument()
    expect(screen.getByText('Go back')).toBeInTheDocument()
  })

  it('calls onConfirm when Delete button is clicked', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDeleteModal onConfirm={onConfirm} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByText('Delete'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmDeleteModal onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Escape key is pressed', () => {
    const onCancel = vi.fn()
    render(<ConfirmDeleteModal onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when overlay is clicked', () => {
    const onCancel = vi.fn()
    const { container } = render(<ConfirmDeleteModal onConfirm={vi.fn()} onCancel={onCancel} />)
    // The overlay is the outermost fixed div
    const overlay = container.querySelector('.fixed.inset-0') as HTMLElement
    fireEvent.click(overlay)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onCancel when modal body is clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmDeleteModal onConfirm={vi.fn()} onCancel={onCancel} />)
    // Click on the title text inside the modal body
    fireEvent.click(screen.getByText('Delete this save?'))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('shows "Deleting…" and disables buttons when loading', () => {
    render(<ConfirmDeleteModal onConfirm={vi.fn()} onCancel={vi.fn()} loading />)
    expect(screen.getByText('Deleting…')).toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()

    const buttons = screen.getAllByRole('button')
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled()
    })
  })

  it('buttons are enabled when not loading', () => {
    render(<ConfirmDeleteModal onConfirm={vi.fn()} onCancel={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    buttons.forEach((btn) => {
      expect(btn).not.toBeDisabled()
    })
  })

  it('focuses the cancel button on mount', () => {
    render(<ConfirmDeleteModal onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(document.activeElement).toBe(screen.getByText('Cancel'))
  })
})
