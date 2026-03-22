import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { useSavedItem, useDeleteItem, useItemTags, useAddTag, useRemoveTag, queryKeys } from '../hooks/queries'
import { useQueryClient } from '@tanstack/react-query'
import AddToTripSheet from '../components/AddToTripSheet'
import SavedItemImage from '../components/SavedItemImage'
import { SecondaryButton, ConfirmDeleteModal } from '../components/ui'
import LocationAutocomplete, { type LocationSelection } from '../components/LocationAutocomplete'
import type { SavedItem, Category } from '../types'
import { X } from 'lucide-react'

const categoryPills: { value: Category; label: string }[] = [
  { value: 'restaurant', label: 'Food' },
  { value: 'activity', label: 'Activity' },
  { value: 'hotel', label: 'Stay' },
  { value: 'transit', label: 'Transit' },
]

export default function ItemDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const navLocation = useLocation()
  const backTo = (navLocation.state as { from?: string })?.from || '/inbox'
  const queryClient = useQueryClient()
  const { data: itemData, isLoading: itemLoading, error: itemError } = useSavedItem(id)
  const deleteItemMutation = useDeleteItem()

  const [item, setItem] = useState<SavedItem | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [imgFailed] = useState(false)

  // Item tags from the new item_tags table
  const { data: itemTagsData } = useItemTags(id)
  const addTagMutation = useAddTag()
  const removeTagMutation = useRemoveTag()

  // Editable fields
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('general')
  const [location, setLocation] = useState<LocationSelection | null>(null)
  const [notes, setNotes] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showTripSheet, setShowTripSheet] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializedRef = useRef(false)

  // Derive loading / notFound from React Query state
  const loading = itemLoading

  // Sync React Query data into local editable state (once on first load)
  useEffect(() => {
    if (itemData && !initializedRef.current) {
      setItem(itemData)
      setTitle(itemData.title)
      setCategory(itemData.category)
      setLocation(itemData.location_name ? {
        name: itemData.location_name,
        lat: itemData.location_lat ?? 0,
        lng: itemData.location_lng ?? 0,
        place_id: itemData.location_place_id ?? '',
        country: itemData.location_country ?? null,
        country_code: itemData.location_country_code ?? null,
        location_type: 'city',
        proximity_radius_km: 50,
        name_en: itemData.location_name_en ?? null,
        name_local: itemData.location_name_local ?? null,
      } : null)
      setNotes(itemData.notes || '')
      // Mark initialized after state is set so debounce doesn't fire on mount
      setTimeout(() => { initializedRef.current = true }, 0)
    }
  }, [itemData])

  // Derive notFound from query state
  useEffect(() => {
    if (!itemLoading && !itemData && (itemError || !id)) {
      setNotFound(true)
    }
  }, [itemLoading, itemData, itemError, id])

  // Mark first_viewed_at on first visit (for "Recently added" graduation)
  useEffect(() => {
    if (itemData && !itemData.first_viewed_at && id) {
      supabase
        .from('saved_items')
        .update({ first_viewed_at: new Date().toISOString(), left_recent: true })
        .eq('id', id)
        .then(() => {
          // No need to update local state — this only affects "Recently added" on Horizon
        })
    }
  }, [itemData, id])

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
      trackEvent('save_edited', user?.id ?? null, { item_id: id, fields_changed: Object.keys(updates) })
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItem(id!) })
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(user?.id ?? '') })
      setTimeout(() => setSaveStatus('idle'), 1500)
    }
  }, [id, user?.id, queryClient])

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
      location_name: location?.name ?? null,
      location_lat: location?.lat ?? null,
      location_lng: location?.lng ?? null,
      location_place_id: location?.place_id ?? null,
      location_country: location?.country ?? null,
      location_country_code: location?.country_code ?? null,
      location_name_en: location?.name_en ?? null,
      location_name_local: location?.name_local ?? null,
      notes: notes.trim() || null,
    })
  }, [title, location, notes, debouncedSave])

  // Derived: current tags from item_tags table (with fallback to old category column)
  const activeTags = useMemo(() => {
    if (itemTagsData && itemTagsData.length > 0) {
      return itemTagsData.map((t) => ({ name: t.tag_name, type: t.tag_type }))
    }
    // Fallback: derive from old category column
    if (category && category !== 'general') {
      return [{ name: category, type: 'category' }]
    }
    return []
  }, [itemTagsData, category])

  const activeCategoryTags = activeTags.filter((t) => t.type === 'category').map((t) => t.name)
  const activeCustomTags = activeTags.filter((t) => t.type === 'custom').map((t) => t.name)

  // Toggle a category tag
  const handleToggleCategoryTag = async (catValue: string) => {
    if (!id || !user) return
    const isActive = activeCategoryTags.includes(catValue)
    if (isActive) {
      removeTagMutation.mutate({ itemId: id, tagName: catValue })
    } else {
      addTagMutation.mutate({ itemId: id, tagName: catValue, tagType: 'category' })
    }
    // Also update the backwards-compat category column
    if (!isActive) {
      // Set the primary category to this one
      setCategory(catValue as Category)
      saveChanges({ category: catValue as Category })
    } else if (activeCategoryTags.length <= 1) {
      // Removing the last category → set to general
      setCategory('general')
      saveChanges({ category: 'general' })
    }
  }

  // Add a custom tag
  const handleAddCustomTag = (tagName: string) => {
    if (!id || !user || !tagName.trim()) return
    addTagMutation.mutate({ itemId: id, tagName: tagName.trim(), tagType: 'custom' })
  }

  // Remove a custom tag
  const handleRemoveTag = (tagName: string) => {
    if (!id || !user) return
    removeTagMutation.mutate({ itemId: id, tagName })
  }

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const handleDelete = async () => {
    if (!id || !user) return
    setDeleting(true)
    deleteItemMutation.mutate(id, {
      onSuccess: () => navigate('/inbox', { state: { toast: 'Item deleted' } }),
      onError: () => {
        setDeleting(false)
        setShowDeleteConfirm(false)
        handleToast('Failed to delete item')
      },
    })
  }

  if (loading) {
    return (
      <div className="px-4 pb-24" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}>
        <div className="animate-pulse">
          <div className="h-5 w-14 bg-bg-pill-dark rounded-full mb-6" />
          <div className="h-56 bg-bg-muted rounded-2xl" />
          <div className="mt-5 space-y-3">
            <div className="h-6 bg-bg-pill-dark rounded-full w-3/4" />
            <div className="h-4 bg-bg-muted rounded-full w-1/3" />
            <div className="h-11 bg-bg-muted rounded-xl mt-4" />
            <div className="h-24 bg-bg-muted rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (notFound || !item) {
    return (
      <div className="px-4 pb-24" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}>
        <button
          onClick={() => navigate(backTo)}
          className="flex items-center gap-1 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        <div className="mt-16 text-center">
          <p className="text-text-tertiary font-medium">Item not found</p>
          <p className="mt-1 text-sm text-text-faint">It may have been deleted</p>
        </div>
      </div>
    )
  }

  // SavedItemImage handles image_url → places_photo_url → Places API fetch → icon fallback
  // We only show the "Fetch Image" button when there's truly no image at all
  const hasAnyImage = (item.image_url || item.places_photo_url) && !imgFailed

  return (
    <div className="px-4 pb-24" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}>
      {/* Header: Back + Save Status + Menu */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(backTo)}
          className="flex items-center gap-1 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        <div className="flex items-center gap-3">
          {saveStatus !== 'idle' && (
            <span className={`text-xs font-medium ${saveStatus === 'saving' ? 'text-text-faint' : 'text-success'}`}>
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
          )}
          {/* ··· overflow menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMenu((v) => !v)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-bg-muted transition-colors"
              aria-label="More options"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-text-tertiary">
                <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM15.5 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl border border-border shadow-lg py-1 z-30">
                <button
                  type="button"
                  onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }}
                  className="w-full text-left px-4 py-2.5 text-[14px] transition-colors"
                  style={{ color: '#c0392b' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fdf0ef')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <ConfirmDeleteModal
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={deleting}
        />
      )}

      {/* Image — only shown for OG metadata images and user uploads */}
      {hasAnyImage ? (
        <SavedItemImage item={item} size="full" className="rounded-2xl" />
      ) : null}

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a title..."
        className="w-full mt-4 text-xl font-bold text-text-primary placeholder:text-text-faint focus:outline-none"
      />

      {/* Source Link */}
      {item.source_url && (
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-2 text-sm text-accent hover:text-accent transition-colors"
        >
          {item.site_name || 'Source'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M6.22 8.72a.75.75 0 001.06 1.06l5.22-5.22v1.69a.75.75 0 001.5 0v-3.5a.75.75 0 00-.75-.75h-3.5a.75.75 0 000 1.5h1.69L6.22 8.72z" />
            <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 007 4H4.75A2.75 2.75 0 002 6.75v4.5A2.75 2.75 0 004.75 14h4.5A2.75 2.75 0 0012 11.25V9a.75.75 0 00-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5z" />
          </svg>
        </a>
      )}

      {/* Add to Trip */}
      <SecondaryButton onClick={() => setShowTripSheet(true)} className="mt-4 w-full">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-accent">
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
        Add to Trip
      </SecondaryButton>

      {showTripSheet && item && (
        <AddToTripSheet
          itemId={item.id}
          onClose={() => setShowTripSheet(false)}
          onAdded={(tripTitle) => handleToast(`Added to "${tripTitle}"`)}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-text-primary text-white text-sm rounded-full shadow-lg whitespace-nowrap pointer-events-none">
          {toast}
        </div>
      )}

      <div className="mt-5 space-y-5">
        {/* Tags — multi-select categories + custom */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Tags</label>
          <div className="flex flex-wrap gap-2">
            {/* Category pills */}
            {categoryPills.map((cat) => {
              const active = activeCategoryTags.includes(cat.value)
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => handleToggleCategoryTag(cat.value)}
                  className="transition-all duration-150"
                  style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                    fontWeight: active ? 500 : 400,
                    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                    border: active ? '1.5px solid var(--color-accent)' : '1.5px solid var(--color-border-input)',
                    background: active ? 'var(--color-accent-light)' : 'transparent',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  }}
                >
                  {cat.label}
                </button>
              )
            })}

            {/* Custom tag pills with × */}
            {activeCustomTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="flex items-center gap-1 transition-all duration-150"
                style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                  fontWeight: 500,
                  padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                  border: '1.5px dotted var(--color-accent)',
                  background: 'var(--color-accent-light)',
                  color: 'var(--color-accent)',
                }}
              >
                {tag}
                <X className="w-3 h-3" />
              </button>
            ))}

            {/* + Tag button / inline input */}
            {showTagInput ? (
              <div
                className="inline-flex items-center"
                style={{
                  border: '1.5px dashed var(--color-border-input)',
                  borderRadius: 20, padding: '4px 10px',
                }}
              >
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const trimmed = tagDraft.trim()
                      if (trimmed) handleAddCustomTag(trimmed)
                      setTagDraft('')
                      setShowTagInput(false)
                    }
                    if (e.key === 'Escape') {
                      setTagDraft('')
                      setShowTagInput(false)
                    }
                  }}
                  onBlur={() => {
                    if (!tagDraft.trim()) setShowTagInput(false)
                  }}
                  placeholder="Tag name"
                  className="outline-none bg-transparent"
                  style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                    color: 'var(--color-text-primary)',
                    width: 80,
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowTagInput(true)
                  setTimeout(() => tagInputRef.current?.focus(), 50)
                }}
                className="transition-all duration-150"
                style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                  fontWeight: 400,
                  padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                  border: '1.5px dashed var(--color-border-input)',
                  background: 'transparent',
                  color: 'var(--color-text-faint)',
                }}
              >+ Tag</button>
            )}
          </div>
        </div>

        {/* Location */}
        <LocationAutocomplete
          value={location?.name ?? ''}
          onSelect={setLocation}
          label="Location"
          optional
        />

        {/* Notes */}
        <div>
          <label htmlFor="detail-notes" className="block text-sm font-medium text-text-secondary mb-1.5">
            Notes
          </label>
          <textarea
            id="detail-notes"
            value={notes}
            onChange={(e) => {
              e.target.style.height = 'auto'
              e.target.style.height = e.target.scrollHeight + 'px'
              setNotes(e.target.value)
            }}
            onFocus={(e) => {
              e.target.style.height = 'auto'
              e.target.style.height = e.target.scrollHeight + 'px'
            }}
            placeholder="Any notes about this place..."
            className="w-full px-4 py-3 border border-border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:text-text-faint resize-none overflow-hidden"
            style={{ minHeight: 80 }}
          />
        </div>

      </div>
    </div>
  )
}
