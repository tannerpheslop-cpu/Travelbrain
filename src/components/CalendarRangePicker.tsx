import { useState, useMemo } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CalendarRangePickerProps {
  startDate: string | null
  endDate: string | null
  onConfirm: (start: string, end: string) => void
  onRemove?: () => void
  onClose: () => void
  defaultMonth?: Date
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatShort(s: string): string {
  const d = parseYMD(s)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// ── Component ──────────────────────────────────────────────────────────────────

export default function CalendarRangePicker({
  startDate,
  endDate,
  onConfirm,
  onRemove,
  onClose,
  defaultMonth,
}: CalendarRangePickerProps) {
  const initial = defaultMonth ?? (startDate ? parseYMD(startDate) : new Date())
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())

  const [selStart, setSelStart] = useState<string | null>(startDate)
  const [selEnd, setSelEnd] = useState<string | null>(endDate)

  const todayStr = toYMD(new Date())

  // ── Calendar grid ──────────────────────────────────────────────────────────

  const days = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    const startDow = firstDay.getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

    const cells: Array<{ date: string; day: number; inMonth: true } | { date: null; day: 0; inMonth: false }> = []

    // Leading blanks
    for (let i = 0; i < startDow; i++) {
      cells.push({ date: null, day: 0, inMonth: false })
    }

    // Month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: toYMD(new Date(viewYear, viewMonth, d)), day: d, inMonth: true })
    }

    return cells
  }, [viewYear, viewMonth])

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // ── Navigation ─────────────────────────────────────────────────────────────

  const goPrev = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  const goNext = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  // ── Day tap logic ──────────────────────────────────────────────────────────

  const handleDayTap = (dateStr: string) => {
    if (!selStart || (selStart && selEnd)) {
      // First tap or resetting
      setSelStart(dateStr)
      setSelEnd(null)
    } else {
      // Second tap
      if (dateStr < selStart) {
        // Tapped before start — swap
        setSelEnd(selStart)
        setSelStart(dateStr)
      } else if (dateStr === selStart) {
        // Same day — clear
        setSelStart(null)
        setSelEnd(null)
      } else {
        setSelEnd(dateStr)
      }
    }
  }

  // ── Day styling ────────────────────────────────────────────────────────────

  const getDayClasses = (dateStr: string): string => {
    const isStart = dateStr === selStart
    const isEnd = dateStr === selEnd
    const isToday = dateStr === todayStr

    const inRange = selStart && selEnd && dateStr > selStart && dateStr < selEnd

    if (isStart || isEnd) {
      return 'bg-blue-600 text-white font-semibold'
    }
    if (inRange) {
      return 'bg-blue-100 text-blue-800'
    }
    if (isToday) {
      return 'font-bold text-blue-600 ring-1 ring-blue-300'
    }
    return 'text-gray-700 hover:bg-gray-100'
  }

  // Range background for cells between start and end
  const getRangeEdgeClasses = (dateStr: string): string => {
    if (!selStart || !selEnd) return ''
    const isStart = dateStr === selStart
    const isEnd = dateStr === selEnd
    if (isStart) return 'rounded-l-full bg-blue-50'
    if (isEnd) return 'rounded-r-full bg-blue-50'
    if (dateStr > selStart && dateStr < selEnd) return 'bg-blue-50'
    return ''
  }

  const canConfirm = selStart && selEnd

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden">
        {/* Drag handle */}
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Select dates</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="px-5 pt-4 pb-5">
          {/* Selected dates pills */}
          <div className="flex items-center gap-2 mb-4">
            <div className={`flex-1 text-center py-2 px-3 rounded-xl text-sm font-medium ${
              selStart ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-400'
            }`}>
              {selStart ? formatShort(selStart) : 'Start date'}
            </div>
            <span className="text-gray-300">→</span>
            <div className={`flex-1 text-center py-2 px-3 rounded-xl text-sm font-medium ${
              selEnd ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-400'
            }`}>
              {selEnd ? formatShort(selEnd) : 'End date'}
            </div>
          </div>

          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={goPrev}
              className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Previous month"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>
            <button
              type="button"
              onClick={goNext}
              className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Next month"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map(wd => (
              <div key={wd} className="text-center text-[11px] font-medium text-gray-400 py-1">
                {wd}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {days.map((cell, i) => {
              if (!cell.inMonth || !cell.date) {
                return <div key={`blank-${i}`} />
              }
              return (
                <div key={cell.date} className={`flex items-center justify-center ${getRangeEdgeClasses(cell.date)}`}>
                  <button
                    type="button"
                    onClick={() => handleDayTap(cell.date!)}
                    className={`w-10 h-10 rounded-full text-sm transition-colors ${getDayClasses(cell.date)}`}
                  >
                    {cell.day}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Actions */}
          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={() => { if (selStart && selEnd) onConfirm(selStart, selEnd) }}
              disabled={!canConfirm}
              className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Confirm
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="w-full py-2.5 text-sm text-gray-400 hover:text-red-500 font-medium transition-colors"
              >
                Remove dates
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
