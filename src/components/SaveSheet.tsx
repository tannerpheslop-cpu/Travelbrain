import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase, invokeEdgeFunction } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { detectLocationFromText } from '../lib/placesTextSearch'
import LocationAutocomplete, { type LocationSelection } from './LocationAutocomplete'
import type { Category, SavedItem } from '../types'

interface Metadata {
  title: string | null
  image: string | null
  description: string | null
  site_name: string | null
  url: string
}

const categories: { value: Category; label: string }[] = [
  { value: 'restaurant', label: 'Food' },
  { value: 'activity', label: 'Activity' },
  { value: 'hotel', label: 'Stay' },
  { value: 'transit', label: 'Transit' },
  { value: 'general', label: 'General' },
]

interface Props {
  onClose: () => void
  onSaved: (item: SavedItem) => void
  initialMode?: 'link' | 'screenshot' | 'manual'
  initialFile?: File
}

// Simple URL detection
function detectUrl(text: string): string | null {
  const trimmed = text.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w-]+\.(com|org|net|io|co|me|tv|app|dev|xyz|info)(\/\S*)?$/i.test(trimmed)) return `https://${trimmed}`
  return null
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

  // Form state
  const [inputText, setInputText] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [location, setLocation] = useState<LocationSelection | null>(null)
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

  // Auto-location detection state
  const [locationManuallySet, setLocationManuallySet] = useState(false)
  const [locationDetecting, setLocationDetecting] = useState(false)
  const lastDetectionTime = useRef(0)
  const detectionDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

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

  // Run location detection and apply result if no manual location set
  const runLocationDetection = useCallback(async (text: string) => {
    if (locationManuallySet) return
    const now = Date.now()
    if (now - lastDetectionTime.current < 3000) return // Rate limit: max 1 call per 3s
    lastDetectionTime.current = now
    setLocationDetecting(true)
    try {
      const result = await detectLocationFromText(text)
      if (result && !locationManuallySet) {
        setLocation({
          name: result.address,
          lat: result.lat,
          lng: result.lng,
          place_id: result.placeId,
          country: result.country,
          country_code: result.countryCode,
          location_type: result.locationType === 'business' ? 'city' : 'city',
          proximity_radius_km: 50,
          name_en: result.name,
          name_local: null,
        })
      }
    } catch { /* ignore */ }
    setLocationDetecting(false)
  }, [locationManuallySet])

  // Debounced text detection: 1.5s after typing stops, if 3+ words and no URL
  useEffect(() => {
    if (detectionDebounce.current) clearTimeout(detectionDebounce.current)
    const words = inputText.trim().split(/\s+/)
    if (words.length < 3 || detectUrl(inputText) || locationManuallySet) return
    detectionDebounce.current = setTimeout(() => {
      runLocationDetection(inputText)
    }, 1500)
    return () => { if (detectionDebounce.current) clearTimeout(detectionDebounce.current) }
  }, [inputText, locationManuallySet, runLocationDetection])

  // URL metadata → location detection
  useEffect(() => {
    if (!metadata || locationManuallySet) return
    const text = [metadata.title, metadata.description].filter(Boolean).join(' ')
    if (text.length > 10) {
      runLocationDetection(text)
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

    const { data, error } = await supabase.from('saved_items').insert({
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
      location_name_en: location?.name_en ?? null,
      location_name_local: location?.name_local ?? null,
      category: category ?? 'general',
      notes: notes.trim() || null,
    }).select().single()

    if (error) {
      setSaveError('Failed to save. Please try again.')
      setSaving(false)
      return
    }

    trackEvent('save_created', user.id, { source_type: sourceType, category: category ?? 'general', location_name: location?.name ?? null })
    onSaved(data as SavedItem)

    // Reset form for rapid successive saves — sheet stays open
    setSaving(false)
    setSaved(true)
    setTimeout(() => {
      setInputText('')
      setTitle('')
      setCategory(null)
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
      setLocationManuallySet(false)
      setLocationDetecting(false)
      inputRef.current?.focus()
    }, 800)
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
        {/* Drag handle */}
        <div className="flex justify-center pt-3 shrink-0">
          <div style={{ width: 36, height: 4, background: 'var(--color-border-input)', borderRadius: 2 }} />
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 pt-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>

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
                  <img
                    src={metadata.image}
                    alt=""
                    style={{ width: 100, height: 80, objectFit: 'cover', background: '#f5f3f0', flexShrink: 0 }}
                    onError={() => setImageFailed(true)}
                  />
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

          {/* 3. Category pills */}
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {categories.map(cat => {
              const active = category === cat.value
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(active ? null : cat.value)}
                  style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    fontWeight: active ? 600 : 400,
                    padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                    border: active ? '1.5px solid #c45a2d' : '1px solid #e0ddd7',
                    background: active ? 'rgba(196,90,45,0.06)' : 'transparent',
                    color: active ? '#c45a2d' : '#6b6860',
                    transition: 'all 0.1s ease',
                  }}
                >{cat.label}</button>
              )
            })}
          </div>

          {/* 4. Location input */}
          <div style={{ marginTop: 12, position: 'relative' }}>
            {locationDetecting && (
              <div style={{
                position: 'absolute', top: 14, right: 14, zIndex: 1,
                width: 6, height: 6, borderRadius: '50%',
                background: 'rgba(196,90,45,0.4)',
                animation: 'pulse 1s ease infinite',
              }} />
            )}
            <LocationAutocomplete
              value={location?.name ?? ''}
              onSelect={(loc) => { setLocation(loc); if (loc) setLocationManuallySet(true) }}
              label=""
              optional
              placeholder="Location..."
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
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
    </>
  )
}
