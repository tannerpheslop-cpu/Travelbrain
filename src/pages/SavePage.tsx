import { useState } from 'react'
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

const categories: { value: Category; label: string }[] = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'activity', label: 'Activity' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'transit', label: 'Transit' },
  { value: 'general', label: 'General' },
]

export default function SavePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'preview' | 'saving' | 'saved' | 'error'>('idle')
  const [metadata, setMetadata] = useState<Metadata | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('general')
  const [city, setCity] = useState('')
  const [notes, setNotes] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmitUrl = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    // Basic URL validation — prepend https:// if no protocol
    let finalUrl = trimmed
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`
    }

    try {
      new URL(finalUrl)
    } catch {
      setErrorMessage('Please enter a valid URL')
      setStatus('error')
      return
    }

    setStatus('loading')
    setErrorMessage('')

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

      if (!response.ok) {
        throw new Error('Failed to fetch metadata')
      }

      const data: Metadata = await response.json()
      setMetadata({ ...data, url: finalUrl })
      setTitle(data.title || '')
      setStatus('preview')
    } catch {
      // Still show preview with empty metadata so user can fill in manually
      setMetadata({ title: null, image: null, description: null, site_name: null, url: finalUrl })
      setTitle('')
      setStatus('preview')
    }
  }

  const handleSave = async () => {
    if (!user) return

    const itemTitle = title.trim() || metadata?.url || 'Untitled'

    setStatus('saving')

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
      setErrorMessage('Failed to save. Please try again.')
      setStatus('error')
      return
    }

    setStatus('saved')
    setTimeout(() => navigate('/inbox'), 800)
  }

  const handleReset = () => {
    setUrl('')
    setStatus('idle')
    setMetadata(null)
    setTitle('')
    setCategory('general')
    setCity('')
    setNotes('')
    setErrorMessage('')
  }

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900">Save</h1>
      <p className="mt-1 text-sm text-gray-500">Save a new travel find</p>

      {/* URL Input */}
      {status === 'idle' || status === 'error' ? (
        <form onSubmit={handleSubmitUrl} className="mt-6">
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (status === 'error') setStatus('idle')
            }}
            placeholder="Paste a link..."
            autoFocus
            className="w-full px-4 py-4 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
          />
          {status === 'error' && errorMessage && (
            <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
          )}
          <button
            type="submit"
            disabled={!url.trim()}
            className="w-full mt-3 px-4 py-3.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Fetch Preview
          </button>
        </form>
      ) : null}

      {/* Loading Skeleton */}
      {status === 'loading' && (
        <div className="mt-6 animate-pulse">
          <div className="bg-gray-200 rounded-xl h-48 w-full" />
          <div className="mt-3 space-y-2">
            <div className="bg-gray-200 rounded-lg h-5 w-3/4" />
            <div className="bg-gray-200 rounded-lg h-4 w-1/3" />
          </div>
        </div>
      )}

      {/* Preview Card + Form */}
      {(status === 'preview' || status === 'saving' || status === 'saved') && metadata && (
        <div className="mt-6 space-y-5">
          {/* Preview Card */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {metadata.image ? (
              <img
                src={metadata.image}
                alt={title || 'Preview'}
                className="w-full h-48 object-cover bg-gray-100"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  target.nextElementSibling?.classList.remove('hidden')
                }}
              />
            ) : null}
            {/* Placeholder shown when no image or image fails to load */}
            <div className={`w-full h-48 bg-gray-100 flex items-center justify-center ${metadata.image ? 'hidden' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-gray-300">
                <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
              </svg>
            </div>
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

          {/* Category Quick-Tap Buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
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

          {/* City Input */}
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1.5">
              City <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Tokyo, Paris, New York"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          {/* Notes Input */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this place..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 resize-none"
            />
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={status === 'saving' || status === 'saved'}
            className={`w-full px-4 py-3.5 rounded-xl text-sm font-medium transition-colors ${
              status === 'saved'
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved!' : 'Save to Inbox'}
          </button>

          {/* Start Over link */}
          {status !== 'saving' && status !== 'saved' && (
            <button
              onClick={handleReset}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Start over
            </button>
          )}

          {status === 'error' && errorMessage && (
            <p className="text-sm text-red-600 text-center">{errorMessage}</p>
          )}
        </div>
      )}
    </div>
  )
}
