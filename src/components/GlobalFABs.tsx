import { Plus, Search } from 'lucide-react'

interface Props {
  onCreateClick: () => void
  onSearchClick: () => void
}

export default function GlobalFABs({ onCreateClick, onSearchClick }: Props) {
  return (
    <div
      className="fixed z-25 right-4 flex flex-col items-center gap-3 pointer-events-none"
      style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 1rem)' }}
    >
      {/* Search button (top, secondary) */}
      <button
        type="button"
        onClick={onSearchClick}
        className="pointer-events-auto w-11 h-11 rounded-full bg-white text-gray-600 border border-gray-200 shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label="Search"
      >
        <Search className="w-5 h-5" />
      </button>

      {/* Create button (bottom, primary) */}
      <button
        type="button"
        onClick={onCreateClick}
        className="pointer-events-auto w-13 h-13 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-200/50 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label="Add save"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  )
}
