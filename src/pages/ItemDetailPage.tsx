import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import AddToTripSheet from '../components/AddToTripSheet'
import type { SavedItem, Category } from '../types'

const categories: { value: Category; label: string }[] = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'activity', label: 'Activity' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'transit', label: 'Transit' },
  { value: 'general', label: 'General' },
]

export default function ItemDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [item, setItem] = useState<SavedItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  // Editable fields
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('general')
  const [city, setCity] = useState('')
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState('')

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [archiving, setArchiving] = useState(false)
  const [showTripSheet, setShowTripSheet] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const handleAlreadyAdded = (tripTitle: string) => {
    setToast(`Already in "${tripTitle}"`)
    setTimeout(() => setToast(null), 2500)
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializedRef = useRef(false)

  // Fetch item
  useEffect(() => {
    if (!user || !id) return

    const fetchItem = async () => {
      const { data, error } = await supabase
        .from('saved_items')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (error || !data) {
        setNotFound(true)
        setLoading(false)
        return
      }

      const saved = data as SavedItem
      setItem(saved)
      setTitle(saved.title)
      setCategory(saved.category)
      setCity(saved.city || '')
      setNotes(saved.notes || '')
      setTags(saved.tags?.join(', ') || '')
      setLoading(false)
      // Mark initialized after state is set so debounce doesn't fire on mount
      setTimeout(() => { initializedRef.current = true }, 0)
    }

    fetchItem()
  }, [user, id])

  // Auto-save with debounce
  const saveChanges = useCallback(async (updates: Partial<SavedItem>) => {
    if (!id) return
    setSaveStatus('saving')
    const { error } = await supabase
      .from('saved_items')
      .update(updates)
      .eq('id', id)

    setSaveStatus(error ? 'idle' : 'saved')
    if (!error) {
      setTimeout(() => setSaveStatus('idle'), 1500)
    }
  }, [id])

  const debouncedSave = useCallback((updates: Partial<SavedItem>) => {
    if (!initializedRef.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveChanges(updates), 1000)
  }, [saveChanges])

  // Trigger debounced save when text fields change
  useEffect(() => {
    if (!initializedRef.current) return
    debouncedSave({
      title: title.trim() || 'Untitled',
      city: city.trim() || null,
      notes: notes.trim() || null,
      tags: tags.trim() ? tags.split(',').map((t) => t.trim()).filter(Boolean) : null,
    })
  }, [title, city, notes, tags, debouncedSave])

  // Save category immediately (no need to debounce a tap)
  const handleCategoryChange = (newCategory: Category) => {
    setCategory(newCategory)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    saveChanges({ category: newCategory })
  }

  const handleArchive = async () => {
    if (!id) return
    setArchiving(true)
    await supabase
      .from('saved_items')
      .update({ is_archived: true })
      .eq('id', id)
    navigate('/inbox')
  }

  if (loading) {
    return (
      <div className="px-4 pt-6 pb-24">
        <div className="animate-pulse">
          <div className="h-6 w-16 bg-gray-200 rounded mb-6" />
          <div className="h-56 bg-gray-200 rounded-2xl" />
          <div className="mt-4 space-y-3">
            <div className="h-6 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-10 bg-gray-200 rounded-xl mt-4" />
            <div className="h-24 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (notFound || !item) {
    return (
      <div className="px-4 pt-6 pb-24">
        <button
          onClick={() => navigate('/inbox')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        <div className="mt-16 text-center">
          <p className="text-gray-500 font-medium">Item not found</p>
          <p className="mt-1 text-sm text-gray-400">It may have been deleted or archived</p>
        </div>
      </div>
    )
  }

  const showImage = item.image_url && !imgFailed

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header: Back + Save Status */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate('/inbox')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        {saveStatus !== 'idle' && (
          <span className={`text-xs font-medium ${saveStatus === 'saving' ? 'text-gray-400' : 'text-green-600'}`}>
            {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
          </span>
        )}
      </div>

      {/* Image */}
      {showImage ? (
        <img
          src={item.image_url!}
          alt={title}
          className="w-full h-56 object-cover rounded-2xl bg-gray-100"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="w-full h-56 bg-gray-100 rounded-2xl flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-gray-300">
            <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a title..."
        className="w-full mt-4 text-xl font-bold text-gray-900 placeholder:text-gray-400 focus:outline-none"
      />

      {/* Source Link */}
      {item.source_url && (
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
        >
          {item.site_name || 'Source'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M6.22 8.72a.75.75 0 001.06 1.06l5.22-5.22v1.69a.75.75 0 001.5 0v-3.5a.75.75 0 00-.75-.75h-3.5a.75.75 0 000 1.5h1.69L6.22 8.72z" />
            <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 007 4H4.75A2.75 2.75 0 002 6.75v4.5A2.75 2.75 0 004.75 14h4.5A2.75 2.75 0 0012 11.25V9a.75.75 0 00-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5z" />
          </svg>
        </a>
      )}

      {/* Add to Trip */}
      <button
        type="button"
        onClick={() => setShowTripSheet(true)}
        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-500">
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
        Add to Trip
      </button>

      {showTripSheet && item && (
        <AddToTripSheet
          itemId={item.id}
          onClose={() => setShowTripSheet(false)}
          onAlreadyAdded={handleAlreadyAdded}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-800 text-white text-sm rounded-full shadow-lg whitespace-nowrap pointer-events-none">
          {toast}
        </div>
      )}

      <div className="mt-5 space-y-5">
        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => handleCategoryChange(cat.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  category === cat.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* City */}
        <div>
          <label htmlFor="detail-city" className="block text-sm font-medium text-gray-700 mb-1.5">
            City
          </label>
          <input
            id="detail-city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Tokyo, Paris, New York"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="detail-notes" className="block text-sm font-medium text-gray-700 mb-1.5">
            Notes
          </label>
          <textarea
            id="detail-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this place..."
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 resize-none"
          />
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="detail-tags" className="block text-sm font-medium text-gray-700 mb-1.5">
            Tags <span className="text-gray-400 font-normal">(comma-separated)</span>
          </label>
          <input
            id="detail-tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. must-try, rooftop, budget"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

        {/* Archive Button */}
        <button
          onClick={handleArchive}
          disabled={archiving}
          className="w-full px-4 py-3 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 active:bg-red-100 transition-colors disabled:opacity-50"
        >
          {archiving ? 'Archiving...' : 'Archive Item'}
        </button>
      </div>
    </div>
  )
}
