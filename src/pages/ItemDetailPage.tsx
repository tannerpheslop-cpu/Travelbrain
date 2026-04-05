import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { useSavedItem, useDeleteItem, useItemTags, useAddTag, useRemoveTag, useUserCustomTags, queryKeys } from '../hooks/queries'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import AddToTripSheet from '../components/AddToTripSheet'
import SavedItemImage from '../components/SavedItemImage'
import { ConfirmDeleteModal } from '../components/ui'
import LocationAutocomplete, { type LocationSelection } from '../components/LocationAutocomplete'
import type { SavedItem, Category, ExtractedItem, Route } from '../types'
import SelectionOverlay from '../components/SelectionOverlay'
import UnpackScreen from '../components/UnpackScreen'
import { createRouteFromExtraction } from '../lib/createRouteFromExtraction'
import { useToast } from '../components/Toast'
import { Search, ChevronRight } from 'lucide-react'
import { SYSTEM_CATEGORIES } from '../lib/categories'


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
  const { data: allCustomTags = [] } = useUserCustomTags(user?.id)

  // Pending extraction for this item
  const { data: pendingExtraction } = useQuery({
    queryKey: ['pending-extraction', id],
    queryFn: async () => {
      if (!id) return null
      const { data } = await supabase
        .from('pending_extractions')
        .select('id, extracted_items, content_type')
        .eq('source_entry_id', id)
        .eq('status', 'pending')
        .maybeSingle()
      return data as { id: string; extracted_items: unknown[]; content_type: string } | null
    },
    enabled: !!id,
  })
  const extractedCount = Array.isArray(pendingExtraction?.extracted_items) ? pendingExtraction!.extracted_items.length : 0

  // Fetch parent Route (if item belongs to one)
  const { data: parentRoute } = useQuery({
    queryKey: ['route', itemData?.route_id ?? ''],
    queryFn: async () => {
      if (!itemData?.route_id) return null
      const { data } = await supabase
        .from('routes')
        .select('id, name, item_count')
        .eq('id', itemData.route_id)
        .single()
      return data as Pick<Route, 'id' | 'name' | 'item_count'> | null
    },
    enabled: !!itemData?.route_id,
  })

  // Editable fields
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('general')
  const [location, setLocation] = useState<LocationSelection | null>(null)
  const [notes, setNotes] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showTripSheet, setShowTripSheet] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showSelectionOverlay, setShowSelectionOverlay] = useState(false)
  const [showUnpackScreen, setShowUnpackScreen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { toast: globalToast } = useToast()
  const menuRef = useRef<HTMLDivElement>(null)

  const handleToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializedRef = useRef(false)
  const locationManuallyChanged = useRef(false)

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

  // Clear extraction badge on detail open
  useEffect(() => {
    if (itemData?.has_pending_extraction && id) {
      supabase
        .from('saved_items')
        .update({ has_pending_extraction: false })
        .eq('id', id)
        .then(() => {
          // Badge cleared — will disappear when user returns to Horizon
        })
    }
  }, [itemData?.has_pending_extraction, id])

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
    const updates: Partial<SavedItem> = {
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
    }
    // Lock location if user manually changed it — prevents Edge Function from overwriting
    if (locationManuallyChanged.current) {
      updates.location_locked = true
      updates.location_precision = location?.location_type === 'country' ? 'country' : 'precise'
      locationManuallyChanged.current = false
    }
    debouncedSave(updates)
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

  // Tag autocomplete suggestions — filter existing custom tags by draft input, exclude already-assigned tags
  const tagSuggestions = useMemo(() => {
    const q = tagDraft.trim().toLowerCase()
    if (!q) return []
    return allCustomTags
      .filter((t: string) => t.toLowerCase().includes(q) && !activeCustomTags.includes(t))
      .slice(0, 5)
  }, [tagDraft, allCustomTags, activeCustomTags])

  // Filtered categories & custom tags based on search input, with assigned-first sort
  const filteredCategories = useMemo(() => {
    const q = tagDraft.trim().toLowerCase()
    const base = q
      ? SYSTEM_CATEGORIES.filter(cat => cat.label.toLowerCase().includes(q) || cat.tagName.toLowerCase().includes(q))
      : [...SYSTEM_CATEGORIES]
    // Sort: assigned first, then unassigned
    return base.sort((a, b) => {
      const aActive = activeCategoryTags.includes(a.tagName) ? 1 : 0
      const bActive = activeCategoryTags.includes(b.tagName) ? 1 : 0
      return bActive - aActive
    })
  }, [tagDraft, activeCategoryTags])

  const filteredCustomTags = useMemo(() => {
    const q = tagDraft.trim().toLowerCase()
    if (!q) return [...activeCustomTags].sort()
    return activeCustomTags.filter(t => t.toLowerCase().includes(q)).sort()
  }, [tagDraft, activeCustomTags])

  // Show "Create" option when search doesn't match any existing tag
  const showCreateOption = useMemo(() => {
    const q = tagDraft.trim()
    if (!q) return false
    const qLower = q.toLowerCase()
    // Check if it matches any system category
    if (SYSTEM_CATEGORIES.some(cat => cat.label.toLowerCase() === qLower || cat.tagName.toLowerCase() === qLower)) return false
    // Check if it matches any existing custom tag (assigned or not)
    if (activeCustomTags.some(t => t.toLowerCase() === qLower)) return false
    if (allCustomTags.some((t: string) => t.toLowerCase() === qLower)) return false
    return true
  }, [tagDraft, activeCustomTags, allCustomTags])

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
      <div style={{ background: 'var(--bg-base)', minHeight: '100vh', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="animate-pulse" style={{ padding: '16px 16px 100px' }}>
          <div style={{ height: 20, width: 56, background: 'var(--bg-elevated-1)', borderRadius: 10, marginBottom: 24 }} />
          <div style={{ height: 224, background: 'var(--bg-elevated-1)', borderRadius: 0 }} />
          <div style={{ marginTop: 20 }}>
            <div style={{ height: 24, background: 'var(--bg-elevated-1)', borderRadius: 8, width: '75%' }} />
            <div style={{ height: 16, background: 'var(--bg-elevated-1)', borderRadius: 8, width: '33%', marginTop: 12 }} />
            <div style={{ height: 44, background: 'var(--bg-elevated-1)', borderRadius: 8, marginTop: 16 }} />
          </div>
        </div>
      </div>
    )
  }

  if (notFound || !item) {
    return (
      <div style={{ background: 'var(--bg-base)', minHeight: '100vh', padding: '16px', paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
        <button
          onClick={() => navigate(backTo)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        <div style={{ marginTop: 64, textAlign: 'center' }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 500, color: 'var(--text-tertiary)' }}>Item not found</p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>It may have been deleted</p>
        </div>
      </div>
    )
  }

  // SavedItemImage handles image_url → places_photo_url → Places API fetch → icon fallback
  // We only show the "Fetch Image" button when there's truly no image at all
  const hasAnyImage = (item.image_url || item.places_photo_url) && !imgFailed

  return (
    <div data-testid="item-detail-page" style={{ background: 'var(--bg-base)', minHeight: '100vh', paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Photo area — full width at top, no border-radius */}
      {hasAnyImage ? (
        <div style={{ overflow: 'hidden' }}>
          <SavedItemImage item={item} size="full" className="!rounded-none w-full" />
        </div>
      ) : (
        <div data-testid="photo-placeholder" style={{ width: '100%', height: 200, background: 'var(--bg-elevated-1)' }} />
      )}

      {/* Header: Back + Save Status + Menu — overlaid on top of photo */}
      <div style={{
        position: 'absolute', top: 'env(safe-area-inset-top)', left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
      }}>
        <button
          onClick={() => navigate(backTo)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(0, 0, 0, 0.5)', border: 'none', cursor: 'pointer',
            color: '#e8eaed',
          }}
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveStatus !== 'idle' && (
            <span style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500,
              color: saveStatus === 'saving' ? 'rgba(255,255,255,0.6)' : '#5b8a72',
              padding: '2px 8px', borderRadius: 6,
              background: 'rgba(0, 0, 0, 0.4)',
            }}>
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
          )}
          {/* ··· overflow menu */}
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMenu((v) => !v)}
              style={{
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8, background: 'rgba(0, 0, 0, 0.5)', border: 'none',
                cursor: 'pointer', color: '#e8eaed',
              }}
              aria-label="More options"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM15.5 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
              </svg>
            </button>
            {showMenu && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4, width: 160,
                background: 'var(--bg-elevated-1)', borderRadius: 10, border: '0.5px solid rgba(118, 130, 142, 0.1)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)', padding: '4px 0', zIndex: 30,
              }}>
                <button
                  type="button"
                  onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#c44a3d',
                    background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div style={{ padding: '16px 16px 100px' }}>
        {/* Delete confirmation modal */}
        {showDeleteConfirm && (
          <ConfirmDeleteModal
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
            loading={deleting}
          />
        )}

        {/* Pending extraction banner */}
        {pendingExtraction && extractedCount >= 2 && (
          <div
            data-testid="extraction-banner"
            style={{
              marginBottom: 12,
              padding: '12px 14px',
              background: 'var(--accent-soft)',
              borderRadius: 8,
              border: '1px solid var(--accent-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
            onClick={() => setShowSelectionOverlay(true)}
          >
            <div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--accent-primary)', margin: 0 }}>
                We found {extractedCount} items in this article
              </p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                Tap to review and save individually
              </p>
            </div>
            <ChevronRight size={16} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
          </div>
        )}

        {/* "Scan for places" — show on eligible URL saves */}
        {item && item.source_type === 'url' && item.source_url && !item.route_id && !item.location_place_id && !pendingExtraction && (
          <button
            type="button"
            onClick={() => setShowUnpackScreen(true)}
            style={{
              width: '100%', padding: '14px 16px', marginBottom: 12,
              background: 'transparent',
              border: '0.5px solid rgba(118, 130, 142, 0.15)',
              borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10,
              textAlign: 'left',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'var(--accent-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Search size={16} color="var(--accent-primary)" />
            </div>
            <div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
                Scan for places
              </p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text-tertiary)', margin: '1px 0 0' }}>
                Find restaurants, attractions, and more in this article
              </p>
            </div>
          </button>
        )}

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a title..."
          style={{
            width: '100%', marginTop: 4,
            fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 500,
            color: 'var(--text-primary)', background: 'transparent', border: 'none', outline: 'none',
          }}
        />

        {/* Location pill (inline, below title) */}
        {location && (
          <div style={{ marginTop: 6 }}>
            <span style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 500,
              padding: '2px 8px', borderRadius: 99,
              background: 'rgba(118, 130, 142, 0.2)',
              color: 'var(--text-tertiary)',
            }}>
              {location.name.split(',')[0]}
            </span>
          </div>
        )}

        {/* Description/context */}
        {item.description && (
          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6,
            color: 'var(--text-secondary)', marginTop: 12,
          }}>
            {item.description}
          </p>
        )}

        {/* Source preview card */}
        {item.source_url && (item.source_title || item.site_name) && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="source-preview-card"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: 10, marginTop: 14,
              background: 'var(--bg-elevated-1)', borderRadius: 8,
              textDecoration: 'none',
            }}
          >
            {item.source_thumbnail && (
              <img
                src={item.source_thumbnail}
                alt=""
                style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500,
                color: 'var(--text-primary)', margin: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.source_title || item.site_name}
              </p>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 9,
                color: 'var(--text-tertiary)', margin: '2px 0 0',
              }}>
                {(() => { try { return new URL(item.source_url!).hostname.replace(/^www\./, '') } catch { return '' } })()}
              </p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 12, height: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
              <path d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" />
            </svg>
          </a>
        )}
        {/* Simple source link fallback (no source_title) */}
        {item.source_url && !item.source_title && !item.site_name && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 8, fontFamily: "'DM Sans', sans-serif",
              fontSize: 13, color: 'var(--accent-primary)', textDecoration: 'none',
            }}
          >
            Source
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" style={{ width: 14, height: 14 }}>
              <path d="M6.22 8.72a.75.75 0 001.06 1.06l5.22-5.22v1.69a.75.75 0 001.5 0v-3.5a.75.75 0 00-.75-.75h-3.5a.75.75 0 000 1.5h1.69L6.22 8.72z" />
              <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 007 4H4.75A2.75 2.75 0 002 6.75v4.5A2.75 2.75 0 004.75 14h4.5A2.75 2.75 0 0012 11.25V9a.75.75 0 00-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5z" />
            </svg>
          </a>
        )}

        {/* "Part of" Route link */}
        {parentRoute && (
          <button
            type="button"
            data-testid="part-of-route-link"
            onClick={() => navigate(`/route/${parentRoute.id}`)}
            style={{
              width: '100%', marginTop: 14,
              background: 'var(--bg-elevated-1)', borderRadius: 8, padding: 10, border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 500,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--text-tertiary)', margin: 0,
              }}>
                Part of
              </p>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500,
                color: 'var(--text-primary)', margin: '2px 0 0',
              }}>
                {parentRoute.name}
              </p>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 9,
                color: 'var(--text-tertiary)', margin: '1px 0 0',
              }}>
                {parentRoute.item_count} place{parentRoute.item_count !== 1 ? 's' : ''}
              </p>
            </div>
            <ChevronRight size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
          </button>
        )}

        {/* Add to Trip */}
        <button
          type="button"
          onClick={() => setShowTripSheet(true)}
          style={{
            width: '100%', marginTop: 14, padding: '12px 20px',
            background: 'transparent',
            border: '0.5px solid rgba(118, 130, 142, 0.2)',
            borderRadius: 8, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
            color: 'var(--text-secondary)',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16, color: 'var(--accent-primary)' }}>
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Add to Trip
        </button>

        {showTripSheet && item && (
          <AddToTripSheet
            itemId={item.id}
            onClose={() => setShowTripSheet(false)}
            onAdded={(tripTitle) => handleToast(`Added to "${tripTitle}"`)}
          />
        )}

        {/* ─── Categories & tags section ─── */}
        <div style={{ marginTop: 20, marginBottom: 16 }}>
          {/* Section header */}
          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: 8,
            }}
            data-testid="tags-section-header"
          >
            Categories &amp; tags
          </div>

          {/* Search / create input */}
          <style>{`.tag-row::-webkit-scrollbar { display: none; }`}</style>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg-elevated-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 9999,
            padding: '8px 14px',
            marginBottom: 10,
          }}>
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              ref={tagInputRef}
              type="text"
              placeholder="Search or create tags..."
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagDraft.trim()) {
                  e.preventDefault()
                  const trimmed = tagDraft.trim()
                  // If there are suggestions, add the first one; otherwise create new
                  if (tagSuggestions.length > 0) {
                    handleAddCustomTag(tagSuggestions[0])
                  } else if (showCreateOption) {
                    handleAddCustomTag(trimmed)
                  }
                  setTagDraft('')
                }
                if (e.key === 'Escape') {
                  setTagDraft('')
                }
              }}
              data-testid="tag-input"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 14,
                fontFamily: "'DM Sans', sans-serif",
                width: '100%',
              }}
            />
          </div>

          {/* Create tag suggestion (when search doesn't match existing) */}
          {tagDraft.trim() && showCreateOption && (
            <button
              type="button"
              onClick={() => { handleAddCustomTag(tagDraft.trim()); setTagDraft('') }}
              data-testid="tag-create-option"
              style={{
                color: 'var(--text-tertiary)',
                fontSize: 12,
                fontFamily: "'DM Sans', sans-serif",
                background: 'none',
                border: 'none',
                padding: '0 0 8px 0',
                cursor: 'pointer',
              }}
            >
              Create &ldquo;#{tagDraft.trim()}&rdquo;
            </button>
          )}

          {/* Row 1: System categories — single horizontal scroll row */}
          <div
            className="tag-row"
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              gap: 6,
              marginBottom: 6,
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}
            data-testid="category-grid"
          >
            {filteredCategories.map((cat) => {
              const active = activeCategoryTags.includes(cat.tagName)
              const Icon = cat.icon
              return (
                <button
                  key={cat.tagName}
                  type="button"
                  onClick={() => handleToggleCategoryTag(cat.tagName)}
                  data-testid={`category-pill-${cat.tagName}`}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 9999,
                    fontSize: 12,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: 'pointer',
                    border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                    background: active ? 'var(--accent-primary)' : 'var(--bg-elevated-1)',
                    color: active ? '#e8eaed' : 'var(--text-tertiary)',
                    transition: 'all 0.15s ease-out',
                  }}
                >
                  <Icon size={14} />
                  {cat.label}
                </button>
              )
            })}
          </div>

          {/* Row 2: User tags — single horizontal scroll row (only if user has tags) */}
          {filteredCustomTags.length > 0 && (
            <div
              className="tag-row"
              style={{
                display: 'flex',
                flexWrap: 'nowrap',
                overflowX: 'auto',
                gap: 6,
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
              }}
              data-testid="custom-tags-list"
            >
              {filteredCustomTags.map((tag) => (
                <span
                  key={tag}
                  data-testid={`custom-tag-${tag}`}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 9999,
                    fontSize: 11,
                    fontFamily: "'DM Sans', sans-serif",
                    background: 'var(--accent-primary)',
                    color: '#e8eaed',
                    border: '1px solid var(--accent-primary)',
                  }}
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    data-testid={`custom-tag-remove-${tag}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#e8eaed',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: 11,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Location */}
        <div style={{ marginTop: 20 }}>
          <LocationAutocomplete
            value={location?.name ?? ''}
            onSelect={(loc) => { setLocation(loc); locationManuallyChanged.current = true }}
            label="Location"
            optional
          />
        </div>

        {/* Notes */}
        <div style={{ marginTop: 20 }}>
          <label
            htmlFor="detail-notes"
            style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 500,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-secondary)', display: 'block', marginBottom: 6,
            }}
          >
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
            style={{
              width: '100%', padding: '12px 14px',
              fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              color: 'var(--text-primary)', background: 'var(--bg-canvas)',
              border: '0.5px solid rgba(118, 130, 142, 0.15)',
              borderRadius: 8, outline: 'none',
              minHeight: 80, resize: 'none', overflow: 'hidden',
            }}
          />
        </div>
      </div>

      {/* Selection overlay for multi-item extraction */}
      {showSelectionOverlay && pendingExtraction && item && user && (
        <SelectionOverlay
          extractionId={pendingExtraction.id}
          sourceEntryId={item.id}
          sourceTitle={item.title}
          sourceUrl={item.source_url ?? ''}
          contentType={pendingExtraction.content_type as 'listicle' | 'itinerary' | 'guide'}
          items={pendingExtraction.extracted_items as Array<ExtractedItem & { likely_duplicate?: boolean }>}
          userId={user.id}
          onClose={() => {
            setShowSelectionOverlay(false)
            queryClient.invalidateQueries({ queryKey: ['pending-extraction', id] })
          }}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
          padding: '10px 16px', background: 'var(--bg-elevated-1)', color: 'var(--text-primary)',
          fontFamily: "'DM Sans', sans-serif", fontSize: 13,
          borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}

      {/* Unpack screen — launched from "Scan for places" */}
      {showUnpackScreen && item && (
        <UnpackScreen
          initialUrl={item.source_url ?? undefined}
          initialPreview={item.title && item.image_url ? {
            title: item.title,
            image: item.image_url,
            site_name: item.site_name,
          } : undefined}
          sourceEntryId={item.id}
          onClose={() => setShowUnpackScreen(false)}
          onComplete={async (extractionId) => {
            if (!user) return
            const result = await createRouteFromExtraction(
              extractionId,
              user.id,
              item.source_url ?? '',
              item.title,
              item.image_url,
              item.site_name,
            )
            setShowUnpackScreen(false)
            if (result) {
              await supabase.from('saved_items').update({ route_id: result.routeId }).eq('id', item.id)
              globalToast(`Created group with ${result.itemCount} places`)
              navigate(`/route/${result.routeId}`)
            }
          }}
        />
      )}
    </div>
  )
}
