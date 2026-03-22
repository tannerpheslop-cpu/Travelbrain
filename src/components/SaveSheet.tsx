import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase, invokeEdgeFunction } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { detectLocationFromText } from '../lib/placesTextSearch'
import { detectUrl } from '../lib/urlDetect'
import { evaluateImageDisplay } from '../lib/evaluateImageDisplay'
import { detectCategoriesFromText } from '../lib/detectCategory'
import { writeItemTags } from '../hooks/queries'
import { useRapidCapture } from '../hooks/useRapidCapture'
import { MapPin, Loader2 } from 'lucide-react'
import ImageWithFade from './ImageWithFade'
import LocationAutocomplete, { type LocationSelection } from './LocationAutocomplete'
import type { Category, SavedItem } from '../types'

interface Metadata {
  title: string | null
  image: string | null
  description: string | null
  site_name: string | null
  url: string
}

const categoryPills: { value: Category; label: string }[] = [
  { value: 'restaurant', label: 'Food' },
  { value: 'activity', label: 'Activity' },
  { value: 'hotel', label: 'Stay' },
  { value: 'transit', label: 'Transit' },
]

interface Props {
  onClose: () => void
  onSaved: (item: SavedItem) => void
  initialMode?: 'link' | 'screenshot' | 'manual'
  initialFile?: File
}

// Source icon character
function sourceChar(siteName: string | null): string {
  const s = (siteName ?? '').toLowerCase()
  if (s.includes('tiktok')) return '♫'
  if (s.includes('instagram')) return '◎'
  if (s.includes('youtube')) return '▶'
  return '↗'
}

export default function SaveSheet({ onClose, onSaved, initialFile }: Props) {
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bulkInputRef = useRef<HTMLTextAreaElement>(null)

  // Bulk entry mode
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkInput, setBulkInput] = useState('')
  const [bulkRecentItems, setBulkRecentItems] = useState<SavedItem[]>([])

  const handleBulkItemCreated = useCallback((item: SavedItem) => {
    setBulkRecentItems((prev) => [item, ...prev])
    onSaved(item)
  }, [onSaved])

  const handleBulkItemUpdated = useCallback((updated: SavedItem) => {
    setBulkRecentItems((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item)),
    )
    window.dispatchEvent(new CustomEvent('horizon-item-updated', { detail: updated }))
  }, [])

  const { createSaves, resolvingIds } = useRapidCapture(
    user?.id,
    handleBulkItemCreated,
    handleBulkItemUpdated,
  )

  // Form state
  const [inputText, setInputText] = useState('')
  const [title, setTitle] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([]) // category values or custom tag names
  const [categoryManuallySet, setCategoryManuallySet] = useState(false)
  const [showCustomTagInput, setShowCustomTagInput] = useState(false)
  const [customTagDraft, setCustomTagDraft] = useState('')
  const customTagInputRef = useRef<HTMLInputElement>(null)
  const [location, setLocation] = useState<LocationSelection | null>(null)
  const [userSelectedLocation, setUserSelectedLocation] = useState(false)
  const [notes, setNotes] = useState('')
  const [saveError, setSaveError] = useState('')

  // URL preview state
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null)
  const [urlLoading, setUrlLoading] = useState(false)
  const [metadata, setMetadata] = useState<Metadata | null>(null)
  const [urlError, setUrlError] = useState('')
  const [imageFailed, setImageFailed] = useState(false)

  // Image attachment state
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null)
  const [attachedUrl, setAttachedUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Save state
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)


  // Location detection state

  // Auto-focus input on mount or when switching modes
  useEffect(() => {
    setTimeout(() => {
      if (bulkMode) {
        bulkInputRef.current?.focus()
      } else {
        inputRef.current?.focus()
      }
    }, 100)
  }, [bulkMode])

  // Bulk entry handlers
  const handleBulkSubmitLine = useCallback(() => {
    const val = bulkInput.trim()
    if (!val) return
    const lines = val.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    createSaves(lines)
    setBulkInput('')
  }, [bulkInput, createSaves])

  const handleBulkKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleBulkSubmitLine()
    }
  }, [handleBulkSubmitLine])

  // Handle initialFile
  useEffect(() => {
    if (initialFile) handleAttachFile(initialFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile])

  // URL detection on input change
  useEffect(() => {
    const url = detectUrl(inputText)
    if (url && url !== detectedUrl) {
      setDetectedUrl(url)
      fetchMetadata(url)
    } else if (!url && detectedUrl) {
      setDetectedUrl(null)
      setMetadata(null)
      setUrlLoading(false)
      setUrlError('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText])

  // Category detection on text changes (lightweight, no API call)
  useEffect(() => {
    const trimmed = inputText.trim()
    if (!trimmed || detectUrl(inputText)) return

    if (!categoryManuallySet && trimmed.length > 3) {
      const detected = detectCategoriesFromText(trimmed)
      if (detected.length > 0) setSelectedTags((prev) => {
        const next = new Set(prev)
        detected.forEach((c) => next.add(c))
        return [...next]
      })
    }
  }, [inputText, categoryManuallySet])

  // Location auto-detection: runs on text input, writes directly to location state
  useEffect(() => {
    const trimmed = inputText.trim()
    if (!trimmed || trimmed.length === 0) return
    if (userSelectedLocation) return
    if (detectUrl(inputText)) return // Don't detect location from raw URLs

    const wordCount = trimmed.split(/\s+/).length
    const delay = wordCount <= 2 ? 2000 : 1500

    const timer = setTimeout(async () => {
      try {
        const result = await detectLocationFromText(trimmed)
        if (result && !userSelectedLocation) {
          setLocation({
            name: result.name,
            lat: result.lat,
            lng: result.lng,
            place_id: result.placeId,
            country: result.country,
            country_code: result.countryCode,
            location_type: 'city',
            proximity_radius_km: 50,
            name_en: result.name,
            name_local: null,
          })
        }
      } catch { /* ignore detection errors */ }
    }, delay)

    return () => clearTimeout(timer)
  }, [inputText, userSelectedLocation])

  // URL metadata → location detection
  useEffect(() => {
    if (!metadata) return
    if (userSelectedLocation) return
    const text = [metadata.title, metadata.description].filter(Boolean).join(' ')
    if (text.length < 10) return

    const timer = setTimeout(async () => {
      try {
        const result = await detectLocationFromText(text)
        if (result && !userSelectedLocation) {
          setLocation({
            name: result.name,
            lat: result.lat,
            lng: result.lng,
            place_id: result.placeId,
            country: result.country,
            country_code: result.countryCode,
            location_type: 'city',
            proximity_radius_km: 50,
            name_en: result.name,
            name_local: null,
          })
        }
      } catch { /* ignore */ }
    }, 1500)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata])

  // URL metadata → category detection
  useEffect(() => {
    if (!metadata) return
    const text = [metadata.title, metadata.description].filter(Boolean).join(' ')

    if (!categoryManuallySet && text.length > 5) {
      const detected = detectCategoriesFromText(text)
      if (detected.length > 0) setSelectedTags((prev) => {
        const next = new Set(prev)
        detected.forEach((c) => next.add(c))
        return [...next]
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata])

  const fetchMetadata = async (url: string) => {
    setUrlLoading(true)
    setUrlError('')
    try {
      const fetched = await invokeEdgeFunction<Metadata>('extract-metadata', { url })
      setMetadata({ ...fetched, url })
      if (fetched.title && !title) setTitle(fetched.title)
      setImageFailed(false)
    } catch {
      setMetadata({ title: null, image: null, description: null, site_name: null, url })
      setUrlError("Couldn't fetch preview — save as link")
    }
    setUrlLoading(false)
  }

  // File attachment
  const handleAttachFile = useCallback(async (file: File) => {
    if (!user || !file.type.startsWith('image/')) return
    setAttachedFile(file)
    setAttachedPreview(URL.createObjectURL(file))
    setUploading(true)

    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('screenshots').upload(path, file)
    if (error) {
      setSaveError('Failed to upload image.')
      setAttachedFile(null)
      setAttachedPreview(null)
      setUploading(false)
      return
    }
    const { data: urlData } = supabase.storage.from('screenshots').getPublicUrl(path)
    setAttachedUrl(urlData.publicUrl)
    setUploading(false)
  }, [user])

  // Clipboard paste detection for images
  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const handlePaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files
      if (files && files.length > 0 && files[0].type.startsWith('image/')) {
        e.preventDefault()
        handleAttachFile(files[0])
      }
    }
    input.addEventListener('paste', handlePaste)
    return () => input.removeEventListener('paste', handlePaste)
  }, [handleAttachFile])

  const removeAttachment = () => {
    setAttachedFile(null)
    setAttachedPreview(null)
    setAttachedUrl(null)
  }

  // Determine source type
  const getSourceType = (): 'url' | 'screenshot' | 'manual' => {
    if (detectedUrl) return 'url'
    if (attachedFile) return 'screenshot'
    return 'manual'
  }

  // Can save?
  const canSave = !saving && !saved && !uploading && !urlLoading && (inputText.trim() !== '' || !!attachedFile || !!attachedUrl)

  // Save
  const handleSave = async () => {
    if (!user || !canSave) return
    setSaving(true)
    setSaveError('')

    const sourceType = getSourceType()
    const itemTitle = title.trim() || inputText.trim() || 'Untitled'
    // User-attached image takes priority over OG metadata image
    const imageUrl = attachedUrl || metadata?.image || null

    const imageDisplay = evaluateImageDisplay({ image_url: imageUrl })

    // Build the core payload (columns guaranteed to exist)
    const corePayload: Record<string, unknown> = {
      user_id: user.id,
      source_type: sourceType,
      source_url: detectedUrl ?? null,
      image_url: imageUrl,
      title: itemTitle,
      description: metadata?.description ?? null,
      site_name: metadata?.site_name ?? null,
      location_name: location?.name ?? null,
      location_lat: location?.lat ?? null,
      location_lng: location?.lng ?? null,
      location_place_id: location?.place_id ?? null,
      location_country: location?.country ?? null,
      location_country_code: location?.country_code ?? null,
      category: (selectedTags.find((t) => ['restaurant', 'activity', 'hotel', 'transit'].includes(t)) as Category) ?? 'general',
      notes: notes.trim() || null,
      image_display: imageDisplay,
    }

    // Extended columns (from recent migrations — may not exist yet)
    const extendedPayload: Record<string, unknown> = {
      ...corePayload,
      location_name_en: location?.name_en ?? null,
      location_name_local: location?.name_local ?? null,
    }

    // Try with all columns first; fall back to core columns if a column doesn't exist
    let { data, error } = await supabase.from('saved_items').insert(extendedPayload).select().single()

    if (error) {
      console.warn('Save with extended columns failed, retrying with core columns:', error.message)
      const retry = await supabase.from('saved_items').insert(corePayload).select().single()
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error('Save failed:', error.message, error.details, error.hint)
      setSaveError('Failed to save. Please try again.')
      setSaving(false)
      return
    }

    const primaryCategory = selectedTags.find((t) => ['restaurant', 'activity', 'hotel', 'transit'].includes(t)) ?? 'general'
    trackEvent('save_created', user.id, { source_type: sourceType, category: primaryCategory, tags: selectedTags, location_name: location?.name ?? null })

    const savedItem = data as SavedItem

    // Write all selected tags to item_tags table
    if (selectedTags.length > 0) {
      const tagRows = selectedTags.map((t) => ({
        tagName: t,
        tagType: (['restaurant', 'activity', 'hotel', 'transit'].includes(t) ? 'category' : 'custom') as 'category' | 'custom',
      }))
      void writeItemTags(savedItem.id, user.id, tagRows)
    }

    // If saved without a location, fire-and-forget server-side detection
    if (!location && savedItem.title && savedItem.title.trim() !== '') {
      const session = (await supabase.auth.getSession()).data.session
      if (session) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
        fetch(`${supabaseUrl}/functions/v1/detect-location`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ item_id: savedItem.id, title: savedItem.title }),
        }).catch(() => {}) // Best-effort — ignore errors
      }
    }

    onSaved(savedItem)

    setSaving(false)
    setSaved(true)

    const resetForm = () => {
      setInputText('')
      setTitle('')
      setSelectedTags([])
      setLocation(null)
      setNotes('')
      setDetectedUrl(null)
      setMetadata(null)
      setUrlLoading(false)
      setUrlError('')
      setImageFailed(false)
      removeAttachment()
      setSaved(false)
      setSaveError('')
      setCategoryManuallySet(false)
      setUserSelectedLocation(false)
      setShowCustomTagInput(false)
      setCustomTagDraft('')
    }

    if (bulkMode) {
      // Bulk mode: reset form and keep sheet open for rapid successive saves
      setTimeout(() => {
        resetForm()
        inputRef.current?.focus()
      }, 800)
    } else {
      // Single entry mode: close sheet after brief confirmation
      setTimeout(() => {
        resetForm()
        onClose()
      }, 300)
    }
  }

  const previewVisible = !!(detectedUrl && (urlLoading || metadata))

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={saving ? undefined : onClose} />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 bg-bg-card rounded-t-3xl flex flex-col"
        style={{ maxHeight: '90dvh' }}
      >
        {/* Drag handle + close button */}
        <div className="relative flex justify-center pt-3 shrink-0">
          <div style={{ width: 36, height: 4, background: 'var(--color-border-input)', borderRadius: 2 }} />
          {!saving && (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-2 flex items-center justify-center transition-colors hover:text-text-secondary"
              style={{
                width: 32,
                height: 32,
                color: 'var(--color-text-tertiary)',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 18,
                lineHeight: 1,
              }}
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 pt-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>

          {bulkMode ? (
            /* ── Bulk entry mode ───────────────────────────────────────── */
            <div>
              <textarea
                ref={bulkInputRef}
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                onKeyDown={handleBulkKeyDown}
                placeholder="Type a place and press Enter..."
                style={{
                  width: '100%', minHeight: 80, padding: '12px 14px',
                  background: '#f5f3f0', borderRadius: 10,
                  border: '1px solid #e8e6e1', outline: 'none', resize: 'vertical',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#2a2a28',
                }}
              />
              <p style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: 'var(--color-text-faint)', marginTop: 6,
              }}>
                Enter to save · Paste a list for bulk add
              </p>

              {/* Recently added items in bulk mode */}
              {bulkRecentItems.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    color: 'var(--color-text-faint)', marginBottom: 6,
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>{bulkRecentItems.length} added</p>
                  <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                    {bulkRecentItems.slice(0, 8).map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 0', fontSize: 13, color: 'var(--color-text-secondary)',
                        }}
                      >
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-accent)', flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </span>
                        {resolvingIds.has(item.id) && !item.location_name ? (
                          <Loader2 style={{ width: 12, height: 12, flexShrink: 0, color: 'var(--color-text-faint)' }} className="animate-spin" />
                        ) : item.location_name ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, fontSize: 11, color: 'var(--color-text-faint)' }}>
                            <MapPin style={{ width: 10, height: 10 }} />
                            {item.location_name.split(',')[0].trim()}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Back to single entry */}
              <button
                type="button"
                onClick={() => setBulkMode(false)}
                style={{
                  marginTop: 14, background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: 'var(--color-text-faint)',
                }}
              >← Back to single entry</button>
            </div>
          ) : (
          /* ── Single entry mode (default) ──────────────────────────── */
          <>
          {/* 1. Input row */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#f5f3f0', borderRadius: 10, padding: '12px 14px',
              border: '1px solid #e8e6e1', transition: 'border-color 0.15s ease',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(196,90,45,0.25)')}
            onBlur={e => (e.currentTarget.style.borderColor = '#e8e6e1')}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Type a note, paste a link..."
              style={{
                flex: 1, border: 'none', background: 'transparent', outline: 'none',
                fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#2a2a28',
              }}
            />
            {/* Attachment button or thumbnail */}
            {attachedPreview ? (
              <div className="relative shrink-0" style={{ width: 32, height: 32 }}>
                <img src={attachedPreview} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
                <button
                  type="button"
                  onClick={removeAttachment}
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 16, height: 16,
                    borderRadius: '50%', background: '#2a2a28', color: 'white', border: 'none',
                    fontSize: 10, lineHeight: 1, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >×</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 32, height: 32, borderRadius: 8, background: '#f0eeea', border: 'none',
                  cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
                  color: '#9e9b94', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              ><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 16, height: 16 }}><path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" /></svg></button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAttachFile(f) }}
            />
          </div>

          {/* 2. URL preview area — always in DOM, animated height */}
          <div
            style={{
              maxHeight: previewVisible ? 140 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.2s ease',
              marginTop: previewVisible ? 12 : 0,
            }}
          >
            {urlLoading && (
              <div className="animate-pulse" style={{ borderRadius: 10, border: '1px solid #eceae5', overflow: 'hidden' }}>
                <div style={{ display: 'flex' }}>
                  <div style={{ width: 100, height: 80, background: '#f5f3f0' }} />
                  <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ height: 10, background: '#f0eeea', borderRadius: 4, width: '40%' }} />
                    <div style={{ height: 14, background: '#f0eeea', borderRadius: 4, width: '80%' }} />
                    <div style={{ height: 10, background: '#f0eeea', borderRadius: 4, width: '60%' }} />
                  </div>
                </div>
              </div>
            )}
            {!urlLoading && metadata && (
              <div style={{ borderRadius: 10, border: '1px solid #eceae5', overflow: 'hidden', display: 'flex' }}>
                {/* Thumbnail */}
                {(metadata.image && !imageFailed) ? (
                  <div style={{ width: 100, height: 80, flexShrink: 0, background: '#f5f3f0' }}>
                    <ImageWithFade
                      src={metadata.image}
                      context="grid-thumbnail"
                      style={{ width: 100, height: 80, objectFit: 'cover' }}
                      eager
                      onError={() => setImageFailed(true)}
                    />
                  </div>
                ) : attachedPreview ? (
                  <img src={attachedPreview} alt="" style={{ width: 100, height: 80, objectFit: 'cover', flexShrink: 0 }} />
                ) : null}
                {/* Content */}
                <div style={{ flex: 1, padding: 10, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#9e9b94' }}>
                      {sourceChar(metadata.site_name)}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#9e9b94' }}>
                      {metadata.site_name || 'Link'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={title || metadata.title || ''}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Title..."
                    style={{
                      marginTop: 2, border: 'none', background: 'transparent', outline: 'none',
                      fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
                      color: '#2a2a28', width: '100%',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  />
                  {metadata.description && (
                    <p style={{
                      fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#6b6860',
                      marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{metadata.description}</p>
                  )}
                  {urlError && (
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#b5b2ab', marginTop: 4 }}>{urlError}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 3. Tag pills — multi-select categories + custom tags */}
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {categoryPills.map(cat => {
              const active = selectedTags.includes(cat.value)
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => {
                    setSelectedTags((prev) =>
                      active ? prev.filter((t) => t !== cat.value) : [...prev, cat.value],
                    )
                    setCategoryManuallySet(true)
                  }}
                  data-testid={`save-tag-${cat.value}`}
                  style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    fontWeight: active ? 600 : 400,
                    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                    border: active ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border-input)',
                    background: active ? 'var(--color-accent-light)' : 'transparent',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >{cat.label}</button>
              )
            })}
            {/* Custom tags already selected */}
            {selectedTags
              .filter((t) => !['restaurant', 'activity', 'hotel', 'transit'].includes(t))
              .map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
                  data-testid={`save-custom-tag-${tag}`}
                  style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    fontWeight: 600,
                    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                    border: '1.5px dotted var(--color-accent)',
                    background: 'var(--color-accent-light)',
                    color: 'var(--color-accent)',
                    transition: 'all 0.15s ease',
                  }}
                >{tag}</button>
              ))}
            {/* + Tag button / inline input */}
            {showCustomTagInput ? (
              <div
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  border: '1.5px dashed var(--color-border-input)',
                  borderRadius: 20, padding: '4px 10px',
                }}
              >
                <input
                  ref={customTagInputRef}
                  type="text"
                  value={customTagDraft}
                  onChange={(e) => setCustomTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const trimmed = customTagDraft.trim()
                      if (trimmed && !selectedTags.includes(trimmed)) {
                        setSelectedTags((prev) => [...prev, trimmed])
                        setCategoryManuallySet(true)
                      }
                      setCustomTagDraft('')
                      setShowCustomTagInput(false)
                    }
                    if (e.key === 'Escape') {
                      setCustomTagDraft('')
                      setShowCustomTagInput(false)
                    }
                  }}
                  onBlur={() => {
                    if (!customTagDraft.trim()) setShowCustomTagInput(false)
                  }}
                  placeholder="Tag name"
                  data-testid="save-custom-tag-input"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    color: 'var(--color-text-primary)',
                    outline: 'none', border: 'none', background: 'transparent',
                    width: 80,
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowCustomTagInput(true)
                  setTimeout(() => customTagInputRef.current?.focus(), 50)
                }}
                data-testid="save-add-tag-btn"
                style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  fontWeight: 400,
                  padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                  border: '1.5px dashed var(--color-border-input)',
                  background: 'transparent',
                  color: 'var(--color-text-faint)',
                  transition: 'all 0.15s ease',
                }}
              >+ Tag</button>
            )}
          </div>

          {/* 4. Location pill + input */}
          <div style={{ marginTop: 12 }}>
            {/* Location pill — shown when location is set (auto-detected or manual) */}
            {location && (
              <div
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 8, marginBottom: 6,
                  background: 'rgba(196,90,45,0.06)', border: '1px solid rgba(196,90,45,0.2)',
                }}
              >
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#c45a2d' }}>↗</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500, color: '#c45a2d' }}>
                  {location.name_en || location.name}
                </span>
                <span
                  onClick={() => { setLocation(null); setUserSelectedLocation(false) }}
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#b5b2ab', cursor: 'pointer', padding: '0 4px' }}
                >×</span>
              </div>
            )}
            <LocationAutocomplete
              value={location?.name ?? ''}
              onSelect={(loc) => { setLocation(loc); if (loc) setUserSelectedLocation(true) }}
              label=""
              optional
              placeholder={location ? 'Change location...' : 'Location...'}
              className="!py-[10px] !px-3 !rounded-lg !text-[13px]"
            />
          </div>

          {/* 5. Notes */}
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            style={{
              marginTop: 12, width: '100%', padding: '10px 12px', border: '1px solid #e0ddd7',
              borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              color: '#2a2a28', background: 'transparent', outline: 'none', resize: 'vertical',
              minHeight: 40,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(196,90,45,0.4)')}
            onBlur={e => (e.currentTarget.style.borderColor = '#e0ddd7')}
          />

          {/* 6. Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            style={{
              marginTop: 14, width: '100%', padding: 12,
              fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
              background: saved ? '#2d9c5e' : '#c45a2d',
              color: 'white', border: 'none', borderRadius: 10, cursor: canSave ? 'pointer' : 'not-allowed',
              opacity: canSave || saved ? 1 : 0.5,
              boxShadow: '0 1px 4px rgba(196,90,45,0.25)',
              transition: 'all 0.15s ease',
            }}
          >{saving ? 'Saving...' : saved ? 'Saved!' : 'Save to Horizon'}</button>

          {saveError && (
            <p style={{ marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#c0392b', textAlign: 'center' }}>{saveError}</p>
          )}

          {/* Bulk add link */}
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setBulkMode(true)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: 'var(--color-text-faint)',
              }}
            >Bulk add</button>
          </div>
          </>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
    </>
  )
}
