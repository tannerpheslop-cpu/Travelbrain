import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from '../../components/Toast'

function ToastTrigger({ message }: { message: string }) {
  const { toast } = useToast()
  return <button onClick={() => toast(message)}>Show toast</button>
}

describe('Toast system', () => {
  it('renders children without toast initially', () => {
    render(
      <ToastProvider>
        <div data-testid="child">Hello</div>
      </ToastProvider>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByTestId('toast-pill')).not.toBeInTheDocument()
  })

  it('shows toast message when toast() is called', () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Saved!" />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('Show toast').click()
    })
    expect(screen.getByTestId('toast-pill')).toBeInTheDocument()
    expect(screen.getByText('Saved!')).toBeInTheDocument()
  })

  it('auto-dismisses after timeout', () => {
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <ToastTrigger message="Gone soon" />
      </ToastProvider>,
    )
    act(() => {
      screen.getByText('Show toast').click()
    })
    expect(screen.getByTestId('toast-pill')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(screen.queryByTestId('toast-pill')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('replaces existing toast with latest message', () => {
    function MultiTrigger() {
      const { toast } = useToast()
      return (
        <>
          <button onClick={() => toast('First')}>First</button>
          <button onClick={() => toast('Second')}>Second</button>
        </>
      )
    }
    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>,
    )
    act(() => { screen.getByText('First').click() })
    act(() => { screen.getByText('Second').click() })
    // Only the latest message should show in the toast pill
    const pill = screen.getByTestId('toast-pill')
    expect(pill.textContent).toBe('Second')
  })
})
