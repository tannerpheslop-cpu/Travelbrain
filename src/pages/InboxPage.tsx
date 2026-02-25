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
  transit: { bg: 'bg-amber-100', text: 'text-amber-700' },
  general: { bg: 'bg-slate-100', text: 'text-slate-600' },
}

// Lighter bg + softer icon color for placeholder cards
const categoryPlaceholderColors: Record<Category, { bg: string; icon: string }> = {
  restaurant: { bg: 'bg-orange-50', icon: 'text-orange-300' },
  activity:   { bg: 'bg-purple-50', icon: 'text-purple-300' },
  hotel:      { bg: 'bg-sky-50',    icon: 'text-sky-300'    },
  transit:    { bg: 'bg-amber-50',  icon: 'text-amber-300'  },
  general:    { bg: 'bg-slate-50',  icon: 'text-slate-300'  },
}

export default function InboxPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all')

  const fetchItems = async () => {
    if (!user) return
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('saved_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError('Could not load your saves. Tap to retry.')
    } else if (data) {
      setItems(data as SavedItem[])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!user) return
    fetchItems()
  }, [user])

  const filtered = items.filter((item) => {
    if (activeCategory !== 'all' && item.category !== activeCategory) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        item.title.toLowerCase().includes(q) ||
        item.city?.toLowerCase().includes(q) ||
        item.notes?.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="px-4 pt-6 pb-28">
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Inbox</h1>
      <p className="mt-1 text-sm text-gray-500">Your saved travel inspiration</p>

      {/* Search Bar */}
      <div className="mt-4 relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"
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
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 shadow-sm"
        />
      </div>

      {/* Category Filter Chips */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {categoryFilters.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setActiveCategory(cat.value)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              activeCategory === cat.value
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div className="mt-5 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex gap-3 p-4">
                <div className="w-20 h-20 bg-gray-100 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="bg-gray-100 rounded-lg h-4 w-3/4" />
                  <div className="flex gap-2">
                    <div className="bg-gray-100 rounded-full h-5 w-20" />
                    <div className="bg-gray-100 rounded h-5 w-16" />
                  </div>
                  <div className="bg-gray-100 rounded h-3 w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="mt-12 text-center">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-red-400">
              <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="mt-3 text-gray-600 font-medium">Couldn't load your saves</p>
          <button
            type="button"
            onClick={fetchItems}
            className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State — no saves at all */}
      {!loading && !error && items.length === 0 && (
        <div className="mt-20 text-center">
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-blue-400">
              <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="mt-4 text-gray-800 font-semibold text-lg">Your inbox is empty</p>
          <p className="mt-1.5 text-sm text-gray-500 max-w-xs mx-auto">
            Paste a link, upload a screenshot, or add a place manually to get started.
          </p>
          <Link
            to="/save"
            className="inline-flex mt-5 items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Save your first place
          </Link>
        </div>
      )}

      {/* No Results State */}
      {!loading && !error && items.length > 0 && filtered.length === 0 && (
        <div className="mt-16 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-gray-300">
              <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="mt-3 text-gray-600 font-medium">No matching items</p>
          <p className="mt-1 text-sm text-gray-400">Try a different search or filter</p>
        </div>
      )}

      {/* Item Cards */}
      {!loading && !error && filtered.length > 0 && (
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
  const placeholder = categoryPlaceholderColors[item.category]
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
        className="block bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
      >
        <div className="flex gap-3 p-4">
          {/* Thumbnail */}
          {showImage ? (
            <img
              src={item.image_url!}
              alt={item.title}
              className="w-20 h-20 object-cover rounded-xl bg-gray-100 shrink-0"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className={`w-20 h-20 ${placeholder.bg} rounded-xl shrink-0 flex items-center justify-center`}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className={`w-8 h-8 ${placeholder.icon}`}
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
          <div className="flex-1 min-w-0 py-0.5 pr-7">
            <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{item.title}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
              </span>
              {item.city && (
                <span className="text-xs text-gray-500 flex items-center gap-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-gray-400">
                    <path fillRule="evenodd" d="M8 1.5A4.5 4.5 0 0 0 3.5 6c0 3.09 4.16 7.89 4.34 8.1a.22.22 0 0 0 .32 0C8.34 13.89 12.5 9.09 12.5 6A4.5 4.5 0 0 0 8 1.5Zm0 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" clipRule="evenodd" />
                  </svg>
                  {item.city}
                </span>
              )}
            </div>
            {item.site_name && (
              <p className="mt-1 text-xs text-gray-400 truncate">{item.site_name}</p>
            )}
          </div>
        </div>
      </Link>

      {/* Add to Trip button */}
      <button
        type="button"
        onClick={() => setShowSheet(true)}
        className="absolute bottom-3.5 right-3.5 p-1.5 rounded-full text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
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
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-900 text-white text-sm rounded-full shadow-lg whitespace-nowrap pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  )
}
