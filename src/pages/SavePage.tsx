import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Category } from '../types'

interface Metadata {
  title: string | null
  image: string | null
  description: string | null
  site_name: string | null
  url: string
}

type SaveMode = 'link' | 'screenshot' | 'manual'

const categories: { value: Category; label: string }[] = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'activity', label: 'Activity' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'transit', label: 'Transit' },
  { value: 'general', label: 'General' },
]

const modes: { value: SaveMode; label: string }[] = [
  { value: 'link', label: 'Paste Link' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'manual', label: 'Manual' },
]

export default function SavePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<SaveMode>('link')

  // Shared fields
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('general')
  const [city, setCity] = useState('')
  const [notes, setNotes] = useState('')
  const [saveError, setSaveError] = useState('')

  // Link mode
  const [url, setUrl] = useState('')
  const [linkStatus, setLinkStatus] = useState<'idle' | 'loading' | 'preview' | 'saving' | 'saved' | 'url_error'>('idle')
  const [metadata, setMetadata] = useState<Metadata | null>(null)
  const [urlError, setUrlError] = useState('')
  const [imageFailed, setImageFailed] = useState(false)

  // Screenshot mode
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'uploading' | 'preview' | 'saving' | 'saved'>('idle')
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // Manual mode
  const [manualStatus, setManualStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const resetAll = () => {
    setTitle('')
    setCategory('general')
    setCity('')
    setNotes('')
    setSaveError('')
    setUrl('')
    setLinkStatus('idle')
    setMetadata(null)
    setUrlError('')
    setImageFailed(false)
    setScreenshotStatus('idle')
    setScreenshotUrl(null)
    setScreenshotPreview(null)
    setManualStatus('idle')
  }

  const handleModeChange = (newMode: SaveMode) => {
    resetAll()
    setMode(newMode)
  }

  // === LINK MODE ===
  const handleSubmitUrl = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    let finalUrl = trimmed
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`
    }

    try {
      new URL(finalUrl)
    } catch {
      setUrlError('Please enter a valid URL')
      setLinkStatus('url_error')
      return
    }

    setLinkStatus('loading')
    setUrlError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()

      const response = await fetch(
        `https://jauohzeyvmitsclnmxwg.supabase.co/functions/v1/extract-metadata`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ url: finalUrl }),
        }
      )

      if (!response.ok) throw new Error('Failed to fetch metadata')

      const data: Metadata = await response.json()
      setMetadata({ ...data, url: finalUrl })
      setTitle(data.title || '')
      setImageFailed(false)
      setLinkStatus('preview')
    } catch {
      setMetadata({ title: null, image: null, description: null, site_name: null, url: finalUrl })
      setTitle('')
      setImageFailed(false)
      setLinkStatus('preview')
    }
  }

  const handleSaveLink = async () => {
    if (!user) return
    const itemTitle = title.trim() || metadata?.url || 'Untitled'

    setLinkStatus('saving')
    setSaveError('')

    const { error } = await supabase.from('saved_items').insert({
      user_id: user.id,
      source_type: 'url',
      source_url: metadata?.url || null,
      image_url: metadata?.image || null,
      title: itemTitle,
      description: metadata?.description || null,
      site_name: metadata?.site_name || null,
      city: city.trim() || null,
      category,
      notes: notes.trim() || null,
    })

    if (error) {
      setSaveError('Failed to save. Please try again.')
      setLinkStatus('preview')
      return
    }

    setLinkStatus('saved')
    setTimeout(() => navigate('/inbox'), 800)
  }

  // === SCREENSHOT MODE ===
  const handleFileSelect = async (file: File) => {
    if (!user) return
    if (!file.type.startsWith('image/')) return

    setScreenshotStatus('uploading')
    setSaveError('')

    // Show local preview immediately
    const localPreview = URL.createObjectURL(file)
    setScreenshotPreview(localPreview)

    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${user.id}/${Date.now()}.${ext}`

    const { error } = await supabase.storage
      .from('screenshots')
      .upload(path, file)

    if (error) {
      setSaveError('Failed to upload image. Please try again.')
      setScreenshotStatus('idle')
      setScreenshotPreview(null)
      return
    }

    const { data: urlData } = supabase.storage
      .from('screenshots')
      .getPublicUrl(path)

    setScreenshotUrl(urlData.publicUrl)
    setScreenshotStatus('preview')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleSaveScreenshot = async () => {
    if (!user) return
    if (!title.trim()) {
      setSaveError('Please add a title for your screenshot.')
      return
    }

    setScreenshotStatus('saving')
    setSaveError('')

    const { error } = await supabase.from('saved_items').insert({
      user_id: user.id,
      source_type: 'screenshot',
      image_url: screenshotUrl,
      title: title.trim(),
      city: city.trim() || null,
      category,
      notes: notes.trim() || null,
    })

    if (error) {
      setSaveError('Failed to save. Please try again.')
      setScreenshotStatus('preview')
      return
    }

    setScreenshotStatus('saved')
    setTimeout(() => navigate('/inbox'), 800)
  }

  // === MANUAL MODE ===
  const handleSaveManual = async () => {
    if (!user) return
    if (!title.trim()) {
      setSaveError('Please add a title.')
      return
    }

    setManualStatus('saving')
    setSaveError('')

    const { error } = await supabase.from('saved_items').insert({
      user_id: user.id,
      source_type: 'manual',
      title: title.trim(),
      city: city.trim() || null,
      category,
      notes: notes.trim() || null,
    })

    if (error) {
      setSaveError('Failed to save. Please try again.')
      setManualStatus('idle')
      return
    }

    setManualStatus('saved')
    setTimeout(() => navigate('/inbox'), 800)
  }

  // Determine current save status across modes
  const isSaving = linkStatus === 'saving' || screenshotStatus === 'saving' || manualStatus === 'saving'
  const isSaved = linkStatus === 'saved' || screenshotStatus === 'saved' || manualStatus === 'saved'

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900">Save</h1>
      <p className="mt-1 text-sm text-gray-500">Save a new travel find</p>

      {/* Mode Tabs */}
      <div className="mt-4 flex rounded-xl bg-gray-100 p-1">
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => handleModeChange(m.value)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === m.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ==================== PASTE LINK MODE ==================== */}
      {mode === 'link' && (
        <>
          {/* URL Input */}
          {(linkStatus === 'idle' || linkStatus === 'url_error') && (
            <form onSubmit={handleSubmitUrl} className="mt-5">
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (linkStatus === 'url_error') setLinkStatus('idle')
                }}
                placeholder="Paste a link..."
                autoFocus
                className="w-full px-4 py-4 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
              />
              {linkStatus === 'url_error' && urlError && (
                <p className="mt-2 text-sm text-red-600">{urlError}</p>
              )}
              <button
                type="submit"
                disabled={!url.trim()}
                className="w-full mt-3 px-4 py-3.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Fetch Preview
              </button>
            </form>
          )}

          {/* Loading Skeleton */}
          {linkStatus === 'loading' && (
            <div className="mt-5 animate-pulse">
              <div className="bg-gray-200 rounded-xl h-48 w-full" />
              <div className="mt-3 space-y-2">
                <div className="bg-gray-200 rounded-lg h-5 w-3/4" />
                <div className="bg-gray-200 rounded-lg h-4 w-1/3" />
              </div>
            </div>
          )}

          {/* Preview + Tag Form */}
          {(linkStatus === 'preview' || linkStatus === 'saving' || linkStatus === 'saved') && metadata && (
            <div className="mt-5 space-y-5">
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                {metadata.image && !imageFailed ? (
                  <img
                    src={metadata.image}
                    alt={title || 'Preview'}
                    className="w-full h-48 object-cover bg-gray-100"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <ImagePlaceholder />
                )}
                <div className="p-4">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Add a title..."
                    className="w-full text-base font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  />
                  {metadata.site_name && (
                    <p className="mt-1 text-sm text-gray-500">{metadata.site_name}</p>
                  )}
                </div>
              </div>

              <CategoryButtons category={category} onChange={setCategory} />
              <CityInput city={city} onChange={setCity} />
              <NotesInput notes={notes} onChange={setNotes} />

              <SaveButton
                onClick={handleSaveLink}
                saving={linkStatus === 'saving'}
                saved={linkStatus === 'saved'}
              />

              {linkStatus !== 'saving' && linkStatus !== 'saved' && (
                <ResetButton onClick={resetAll} />
              )}

              {saveError && <p className="text-sm text-red-600 text-center">{saveError}</p>}
            </div>
          )}
        </>
      )}

      {/* ==================== SCREENSHOT MODE ==================== */}
      {mode === 'screenshot' && (
        <div className="mt-5 space-y-5">
          {/* Upload Area */}
          {(screenshotStatus === 'idle' || screenshotStatus === 'uploading') && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
                }`}
              >
                {screenshotStatus === 'uploading' ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-gray-400 mb-2">
                      <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06l-3.22-3.22V16.5a.75.75 0 01-1.5 0V4.81L8.03 8.03a.75.75 0 01-1.06-1.06l4.5-4.5z" clipRule="evenodd" />
                      <path fillRule="evenodd" d="M1.5 15a.75.75 0 01.75.75V18a1.5 1.5 0 001.5 1.5h16.5a1.5 1.5 0 001.5-1.5v-2.25a.75.75 0 011.5 0V18a3 3 0 01-3 3H3.75a3 3 0 01-3-3v-2.25A.75.75 0 011.5 15z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm font-medium text-gray-600">Tap to select an image</p>
                    <p className="text-xs text-gray-400 mt-1">or drag and drop</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(file)
                }}
              />
            </>
          )}

          {/* Screenshot Preview + Tag Form */}
          {(screenshotStatus === 'preview' || screenshotStatus === 'saving' || screenshotStatus === 'saved') && (
            <>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                {screenshotPreview && (
                  <img
                    src={screenshotPreview}
                    alt="Screenshot"
                    className="w-full h-48 object-cover bg-gray-100"
                  />
                )}
                <div className="p-4">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Add a title (required)..."
                    className="w-full text-base font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  />
                </div>
              </div>

              <CategoryButtons category={category} onChange={setCategory} />
              <CityInput city={city} onChange={setCity} />
              <NotesInput notes={notes} onChange={setNotes} />

              <SaveButton
                onClick={handleSaveScreenshot}
                saving={screenshotStatus === 'saving'}
                saved={screenshotStatus === 'saved'}
                disabled={!title.trim()}
              />

              {screenshotStatus !== 'saving' && screenshotStatus !== 'saved' && (
                <ResetButton onClick={resetAll} />
              )}

              {saveError && <p className="text-sm text-red-600 text-center">{saveError}</p>}
            </>
          )}

          {/* Show error during idle/uploading phase */}
          {screenshotStatus === 'idle' && saveError && (
            <p className="text-sm text-red-600 text-center">{saveError}</p>
          )}
        </div>
      )}

      {/* ==================== MANUAL MODE ==================== */}
      {mode === 'manual' && (
        <div className="mt-5 space-y-5">
          {/* Title (required) */}
          <div>
            <label htmlFor="manual-title" className="block text-sm font-medium text-gray-700 mb-1.5">
              Title
            </label>
            <input
              id="manual-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. That ramen place near Shibuya..."
              autoFocus
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          <CategoryButtons category={category} onChange={setCategory} />
          <CityInput city={city} onChange={setCity} />
          <NotesInput notes={notes} onChange={setNotes} />

          <SaveButton
            onClick={handleSaveManual}
            saving={isSaving}
            saved={isSaved}
            disabled={!title.trim()}
          />

          {saveError && <p className="text-sm text-red-600 text-center">{saveError}</p>}
        </div>
      )}
    </div>
  )
}

// === Shared Sub-Components ===

function ImagePlaceholder() {
  return (
    <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-gray-300">
        <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
      </svg>
    </div>
  )
}

function CategoryButtons({ category, onChange }: { category: Category; onChange: (c: Category) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => onChange(cat.value)}
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
  )
}

function CityInput({ city, onChange }: { city: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1.5">
        City <span className="text-gray-400 font-normal">(optional)</span>
      </label>
      <input
        id="city"
        type="text"
        value={city}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Tokyo, Paris, New York"
        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
      />
    </div>
  )
}

function NotesInput({ notes, onChange }: { notes: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1.5">
        Notes <span className="text-gray-400 font-normal">(optional)</span>
      </label>
      <textarea
        id="notes"
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Any notes about this place..."
        rows={3}
        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 resize-none"
      />
    </div>
  )
}

function SaveButton({ onClick, saving, saved, disabled }: {
  onClick: () => void
  saving: boolean
  saved: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving || saved || disabled}
      className={`w-full px-4 py-3.5 rounded-xl text-sm font-medium transition-colors ${
        saved
          ? 'bg-green-600 text-white'
          : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed'
      }`}
    >
      {saving ? 'Saving...' : saved ? 'Saved!' : 'Save to Inbox'}
    </button>
  )
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
    >
      Start over
    </button>
  )
}
