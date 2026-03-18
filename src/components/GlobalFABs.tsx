import { Plus } from 'lucide-react'

interface Props {
  onCreateClick: () => void
}

export default function GlobalFABs({ onCreateClick }: Props) {
  return (
    <div
      className="fixed z-25 right-4 pointer-events-none"
      style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 1rem)' }}
    >
      <button
        type="button"
        onClick={onCreateClick}
        className="pointer-events-auto w-13 h-13 rounded-full bg-accent text-white shadow-lg shadow-accent/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label="Add save"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  )
}
