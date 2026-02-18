import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import AddToTripSheet from '../components/AddToTripSheet'
import type { SavedItem, Category } from '../types'

const categoryFilters: { value: Category | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'activity', label: 'Activity' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'transit', label: 'Transit' },
  { value: 'general', label: 'General' },
]

const categoryColors: Record<Category, { bg: string; text: string }> = {
  restaurant: { bg: 'bg-orange-100', text: 'text-orange-700' },
  activity: { bg: 'bg-purple-100', text: 'text-purple-700' },
  hotel: { bg: 'bg-blue-100', text: 'text-blue-700' },
  transit: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  general: { bg: 'bg-gray-100', text: 'text-gray-700' },
}

export default function InboxPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all')

  useEffect(() => {
    if (!user) return

    const fetchItems = async () => {
      const { data, error } = await supabase
        .from('saved_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })

      if (!error && data) {
        setItems(data as SavedItem[])
      }
      setLoading(false)
    }

    fetchItems()
  }, [user])

  const filtered = items.filter((item) => {
    if (activeCategory !== 'all' && item.category !== activeCategory) return false

    if (search.trim()) {
      const q = search.toLowerCase()
      const matchesTitle = item.title.toLowerCase().includes(q)
      const matchesCity = item.city?.toLowerCase().includes(q)
      const matchesNotes = item.notes?.toLowerCase().includes(q)
      if (!matchesTitle && !matchesCity && !matchesNotes) return false
    }

    return true
  })

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
      <p className="mt-1 text-sm text-gray-500">Your saved travel inspiration</p>

      {/* Search Bar */}
      <div className="mt-4 relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, city, or notes..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
        />
      </div>

      {/* Category Filter Chips */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {categoryFilters.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setActiveCategory(cat.value)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === cat.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="flex gap-3 p-3">
                <div className="w-20 h-20 bg-gray-200 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="bg-gray-200 rounded h-4 w-3/4" />
                  <div className="bg-gray-200 rounded h-3 w-1/3" />
                  <div className="bg-gray-200 rounded h-3 w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && items.length === 0 && (
        <div className="mt-16 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-12 h-12 text-gray-300 mx-auto"
          >
            <path
              fillRule="evenodd"
              d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z"
              clipRule="evenodd"
            />
          </svg>
          <p className="mt-3 text-gray-500 font-medium">No saves yet</p>
          <p className="mt-1 text-sm text-gray-400">Paste a link on the Save tab to get started</p>
        </div>
      )}

      {/* No Results State */}
      {!loading && items.length > 0 && filtered.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-gray-500 font-medium">No matching items</p>
          <p className="mt-1 text-sm text-gray-400">Try a different search or filter</p>
        </div>
      )}

      {/* Item Cards */}
      {!loading && filtered.length > 0 && (
        <div className="mt-4 space-y-3">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function ItemCard({ item }: { item: SavedItem }) {
  const colors = categoryColors[item.category]
  const [imgFailed, setImgFailed] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const showImage = item.image_url && !imgFailed

  const handleToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <div className="relative">
      <Link
        to={`/item/${item.id}`}
        className="block bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md active:bg-gray-50 transition-all"
      >
        <div className="flex gap-3 p-3">
          {/* Thumbnail */}
          {showImage ? (
            <img
              src={item.image_url!}
              alt={item.title}
              className="w-20 h-20 object-cover rounded-xl bg-gray-100 shrink-0"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="w-20 h-20 bg-gray-100 rounded-xl shrink-0 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-8 h-8 text-gray-300"
              >
                <path
                  fillRule="evenodd"
                  d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0 py-0.5 pr-8">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{item.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
              </span>
              {item.city && (
                <span className="text-xs text-gray-500 truncate">{item.city}</span>
              )}
            </div>
            {item.site_name && (
              <p className="mt-1 text-xs text-gray-400 truncate">{item.site_name}</p>
            )}
          </div>
        </div>
      </Link>

      {/* Add to Trip button — outside Link to avoid navigation */}
      <button
        type="button"
        onClick={() => setShowSheet(true)}
        className="absolute bottom-3 right-3 p-1.5 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        aria-label="Add to trip"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
      </button>

      {showSheet && (
        <AddToTripSheet
          itemId={item.id}
          onClose={() => setShowSheet(false)}
          onAdded={(tripTitle) => handleToast(`Added to "${tripTitle}"`)}
          onAlreadyAdded={(tripTitle) => handleToast(`Already in "${tripTitle}"`)}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-800 text-white text-sm rounded-full shadow-lg whitespace-nowrap pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  )
}
