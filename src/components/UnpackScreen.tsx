import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Check, AlertTriangle, Heart } from 'lucide-react'
import { supabase, supabaseUrl, invokeEdgeFunction } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from './Toast'
import type { Category } from '../types'
import { getCategoryLabel, LEGACY_CATEGORY_MAP } from '../lib/categories'

// ── Types ────────────────────────────────────────────────────────────────────

interface OgPreview {
  title: string | null
  image: string | null
  description: string | null
  site_name: string | null
  source_content?: string | null
}

interface ExtractedDisplayItem {
  name: string
  category: string
  categories?: string[]
  location_name: string | null
  context: string | null
  section_label: string
  section_order: number
  item_order: number
}

interface UnpackScreenProps {
  onClose: () => void
  onComplete: (extractionId: string, entryId: string) => void
  initialUrl?: string
  initialPreview?: { title: string | null; image: string | null; site_name: string | null }
  sourceEntryId?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function deriveTitleFromText(text: string): string {
  const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length >= 10)
  if (!firstLine) return 'Untitled Route'
  return firstLine.length <= 60
    ? firstLine
    : firstLine.slice(0, 60).replace(/\s+\S*$/, '') + '\u2026'
}

function capitalizeDomain(url: string): string {
  const domain = extractDomain(url)
  return domain.charAt(0).toUpperCase() + domain.slice(1)
}

function resolveCategoryLabel(category: string): string {
  const resolved = LEGACY_CATEGORY_MAP[category] ?? category
  return getCategoryLabel(resolved)
}

function extractCity(locationName: string | null): string | null {
  if (!locationName) return null
  return locationName.split(',')[0]?.trim() || null
}

/** Light sanitization for user-pasted text (may contain HTML from copy-paste). */
function sanitizePastedText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Stable unique key for an extracted item (survives array reordering). */
function itemKey(item: ExtractedDisplayItem): string {
  return `${item.name}::${item.section_label}::${item.item_order}`
}

// ── Component ────────────────────────────────────────────────────────────────

type Step = 'input' | 'processing' | 'done'
type Status = 'reading' | 'extracting' | 'complete' | 'error'

export default function UnpackScreen({ onClose, onComplete, initialUrl, initialPreview, sourceEntryId }: UnpackScreenProps) {
  const { user } = useAuth()
  const { toast } = useToast()

  const [step, setStep] = useState<Step>('input')
  const [visible, setVisible] = useState(false)

  // Step 1
  const [urlInput, setUrlInput] = useState(initialUrl ?? '')
  const [preview, setPreview] = useState<OgPreview | null>(
    initialPreview ? { title: initialPreview.title, image: initialPreview.image, description: null, site_name: initialPreview.site_name } : null
  )
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [starting, setStarting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputMode, setInputMode] = useState<'url' | 'text'>(initialUrl ? 'url' : 'url')
  const [pastedText, setPastedText] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [showPasteFallback, setShowPasteFallback] = useState(false)

  // Step 2 + 3
  const [items, setItems] = useState<ExtractedDisplayItem[]>([])
  const [itemCount, setItemCount] = useState(0)
  const [, setPrevCount] = useState(0)
  const [status, setStatus] = useState<Status>('reading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [entryId, setEntryId] = useState<string | null>(sourceEntryId ?? null)
  const cancelledRef = useRef(false)
  const [isSaving, setIsSaving] = useState(false)

  // Completion checkboxes — all checked by default, keyed by stable item key
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const allChecked = checkedItems.size === items.length && items.length > 0

  // Duplicate URL detection
  const [duplicateRoute, setDuplicateRoute] = useState<{ id: string; name: string } | null>(null)
  const skipDuplicateCheckRef = useRef(false)

  // Progressive reveal queue
  const [displayedItems, setDisplayedItems] = useState<ExtractedDisplayItem[]>([])
  const [displayedCount, setDisplayedCount] = useState(0)
  const revealQueueRef = useRef<ExtractedDisplayItem[]>([])
  const revealingRef = useRef(false)

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    inputRef.current?.focus()
  }, [])

  // Progressive reveal: items appear one at a time with 200ms delay
  const revealItems = useCallback(async (newItems: ExtractedDisplayItem[]) => {
    revealQueueRef.current.push(...newItems)

    if (revealingRef.current) return // Already processing queue
    revealingRef.current = true

    while (revealQueueRef.current.length > 0) {
      if (cancelledRef.current) break
      const item = revealQueueRef.current.shift()!
      setDisplayedItems(prev => [...prev, item])
      setDisplayedCount(prev => prev + 1)
      await new Promise(r => setTimeout(r, 200))
    }

    revealingRef.current = false
  }, [])

  // Clean up orphaned source entry when Unpack fails or is canceled
  const cleanupSourceEntry = useCallback(async (id: string | null) => {
    if (!id) return
    try {
      // Only delete if no Route was created from this entry (check route_items)
      const { data: linkedRoute } = await supabase
        .from('route_items')
        .select('id')
        .eq('saved_item_id', id)
        .limit(1)
        .maybeSingle()
      if (!linkedRoute) {
        await supabase.from('saved_items').delete().eq('id', id)
        console.log('[unpack] Cleaned up orphaned source entry:', id)
      }
    } catch (err) {
      console.error('[unpack] Cleanup failed:', err)
    }
  }, [])

  const handleClose = useCallback(() => {
    cancelledRef.current = true
    // Clean up orphaned source entry if we created one during this session
    // (only if sourceEntryId was NOT passed in — those belong to the caller)
    if (entryId && !sourceEntryId) {
      cleanupSourceEntry(entryId)
    }
    setVisible(false)
    setTimeout(onClose, 200)
  }, [onClose, entryId, sourceEntryId, cleanupSourceEntry])

  // ── Step 1: OG preview ──
  useEffect(() => {
    if (!urlInput || urlInput.length < 10) { setPreview(null); return }
    let isUrl = false
    try { new URL(urlInput); isUrl = true } catch { /* */ }
    if (!isUrl) { setPreview(null); return }

    const timer = setTimeout(async () => {
      setLoadingPreview(true)
      try {
        const og = await invokeEdgeFunction<OgPreview>('extract-metadata', { url: urlInput, user_id: user?.id })
        setPreview(og)
      } catch { setPreview(null) }
      setLoadingPreview(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [urlInput, user?.id])

  // ── Start: client-orchestrated extraction ──
  const handleStart = useCallback(async () => {
    if (!urlInput || !user || starting) return
    setStarting(true)
    setDuplicateRoute(null)
    cancelledRef.current = false

    let currentEntryId = entryId
    try {
      // Check for existing Route from this URL (unless user chose "Unpack again")
      if (!skipDuplicateCheckRef.current) {
        const { data: existingRoute } = await supabase
          .from('routes')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('source_url', urlInput)
          .maybeSingle()

        if (existingRoute) {
          setDuplicateRoute(existingRoute)
          setStarting(false)
          return
        }
      }
      skipDuplicateCheckRef.current = false

      // Quick-save the URL if no existing entry
      if (!currentEntryId) {
        const { data: entry, error } = await supabase.from('saved_items').insert({
          user_id: user.id,
          source_type: 'url',
          source_url: urlInput,
          title: preview?.title || urlInput,
          image_url: preview?.image || null,
          description: preview?.description || null,
          site_name: preview?.site_name || null,
          image_display: preview?.image ? 'thumbnail' : 'none',
          source_content: preview?.source_content || null,
          category: 'general' as Category,
        }).select('id').single()

        if (error || !entry) {
          toast('Failed to save URL')
          setStarting(false)
          return
        }
        currentEntryId = entry.id
        setEntryId(entry.id)
      }

      // Transition to processing
      setStep('processing')
      setStatus('reading')
      setErrorMessage(null)

      // Step 1: Prepare — get chunks from Edge Function
      const session = (await supabase.auth.getSession()).data.session
      if (!session) { setStarting(false); return }
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': anonKey,
      }

      let prepareRes: Response
      try {
        prepareRes = await fetch(`${supabaseUrl}/functions/v1/prepare-extraction`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ url: urlInput, source_content: preview?.source_content || null }),
          signal: AbortSignal.timeout(20000),
        })
      } catch (err) {
        console.error('[unpack] prepare-extraction failed:', err)
        setStatus('error')
        setErrorMessage("Couldn't read the article. Please try again.")
        if (!sourceEntryId) { cleanupSourceEntry(currentEntryId); setEntryId(null) }
        setStarting(false)
        return
      }

      if (!prepareRes.ok) {
        setStatus('error')
        // Try to parse error details from response body
        try {
          const errData = await prepareRes.json() as { error?: string }
          if (errData.error === 'site_blocked') {
            setShowPasteFallback(true)
            setErrorMessage(null)
          } else if (errData.error === 'page_not_found') {
            setErrorMessage("This page couldn't be loaded. Check the URL and try again.")
          } else {
            setErrorMessage("Couldn't read the article. Please try again.")
          }
        } catch {
          setErrorMessage("Couldn't read the article. Please try again.")
        }
        if (!sourceEntryId) { cleanupSourceEntry(currentEntryId); setEntryId(null) }
        setStarting(false)
        return
      }

      const prepareData = await prepareRes.json() as {
        success: boolean; chunks?: string[]; title?: string; thumbnail?: string; domain?: string; error?: string
      }

      if (!prepareData.success || !prepareData.chunks?.length) {
        setStatus('error')
        const errCode = prepareData.error
        if (errCode === 'site_blocked') {
          setShowPasteFallback(true)
          setErrorMessage(null)
        } else if (errCode === 'content_too_short') {
          setErrorMessage("This article doesn't have enough text content to extract places from. Try a different article.")
        } else if (errCode === 'page_not_found') {
          setErrorMessage("This page couldn't be loaded. Check the URL and try again.")
        } else {
          setErrorMessage("Something went wrong. Please try again.")
        }
        if (!sourceEntryId) { cleanupSourceEntry(currentEntryId); setEntryId(null) }
        setStarting(false)
        return
      }

      const { chunks, title: articleTitle } = prepareData
      // Update preview with fetched metadata if we didn't have it
      if (!preview?.title && articleTitle) {
        setPreview(prev => prev ? { ...prev, title: articleTitle } : { title: articleTitle, image: prepareData.thumbnail ?? null, description: null, site_name: null })
      }

      setStatus('extracting')

      // Step 2: Extract each chunk sequentially
      const allItems: ExtractedDisplayItem[] = []
      const seenNames = new Set<string>()

      for (let i = 0; i < chunks.length; i++) {
        if (cancelledRef.current) return

        try {
          const chunkRes = await fetch(`${supabaseUrl}/functions/v1/extract-chunk`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              chunk: chunks[i],
              title: articleTitle ?? 'Untitled',
              chunk_index: i,
              total_chunks: chunks.length,
            }),
            signal: AbortSignal.timeout(45000),
          })

          if (cancelledRef.current) return // Check after async

          if (!chunkRes.ok) {
            console.error(`[unpack] extract-chunk ${i + 1} failed: HTTP ${chunkRes.status}`)
            continue
          }

          const chunkData = await chunkRes.json() as {
            success: boolean; items?: ExtractedDisplayItem[]; item_count?: number
          }

          if (cancelledRef.current) return // Check after async

          if (chunkData.success && chunkData.items?.length) {
            const newItems: ExtractedDisplayItem[] = []
            for (const item of chunkData.items) {
              const key = item.name.toLowerCase().trim()
              if (!seenNames.has(key)) {
                seenNames.add(key)
                newItems.push(item)
              }
            }

            if (newItems.length > 0) {
              allItems.push(...newItems)
              // Keep items state for save (all items), but use progressive reveal for display
              setItems([...allItems])
              // Queue items for progressive reveal (one at a time, 200ms apart)
              revealItems(newItems)
            }
          }
        } catch (err) {
          if (cancelledRef.current) return
          console.error(`[unpack] Chunk ${i + 1} error:`, err)
        }

        if (cancelledRef.current) return // Check before delay
        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 300))
          if (cancelledRef.current) return // Check after delay
        }
      }

      if (cancelledRef.current) return

      if (allItems.length === 0) {
        setStatus('error')
        setErrorMessage('No places found in this article.')
        if (!sourceEntryId) { cleanupSourceEntry(currentEntryId); setEntryId(null) }
        setStarting(false)
        return
      }

      // Step 3: Done — show completion screen
      setStatus('complete')
      setCheckedItems(new Set(allItems.map(item => itemKey(item)))) // All checked by default
      setStep('done')

    } catch (err) {
      console.error('[unpack] Start failed:', err)
      setStatus('error')
      setErrorMessage('Something went wrong. Please try again.')
      if (!sourceEntryId) { cleanupSourceEntry(currentEntryId); setEntryId(null) }
      setStarting(false)
    }
  }, [urlInput, user, starting, preview, entryId, toast, itemCount, sourceEntryId, cleanupSourceEntry])

  // ── Extract from pasted text ──
  const handleExtractFromText = useCallback(async (textContent: string) => {
    if (!user || starting) return

    const sanitized = sanitizePastedText(textContent)
    if (sanitized.length < 100) {
      setPasteError('The pasted text is too short to extract places from. Try copying more of the article.')
      return
    }
    setPasteError(null)
    setStarting(true)
    cancelledRef.current = false

    let currentEntryId = entryId
    try {
      // Create source entry if we don't have one (direct text mode, no URL)
      if (!currentEntryId && urlInput) {
        const { data: entry, error } = await supabase.from('saved_items').insert({
          user_id: user.id,
          source_type: 'url',
          source_url: urlInput,
          title: preview?.title || urlInput,
          image_url: preview?.image || null,
          description: preview?.description || null,
          site_name: preview?.site_name || null,
          image_display: preview?.image ? 'thumbnail' : 'none',
          category: 'general' as Category,
        }).select('id').single()
        if (!error && entry) {
          currentEntryId = entry.id
          setEntryId(entry.id)
        }
      }
      if (!currentEntryId) {
        // Text mode with no URL — create a text-based entry
        const { data: entry, error } = await supabase.from('saved_items').insert({
          user_id: user.id,
          source_type: 'manual',
          title: deriveTitleFromText(sanitized),
          image_display: 'none',
          category: 'general' as Category,
        }).select('id').single()
        if (error || !entry) {
          toast('Failed to create entry')
          setStarting(false)
          return
        }
        currentEntryId = entry.id
        setEntryId(entry.id)
      }

      // Transition to processing
      setStep('processing')
      setStatus('reading')
      setErrorMessage(null)
      setShowPasteFallback(false)
      setDisplayedItems([])
      setDisplayedCount(0)
      revealQueueRef.current = []
      revealingRef.current = false

      const session = (await supabase.auth.getSession()).data.session
      if (!session) { setStarting(false); return }
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': anonKey,
      }

      // Send pasted text to prepare-extraction with `text` param (skip URL fetch)
      let prepareRes: Response
      try {
        prepareRes = await fetch(`${supabaseUrl}/functions/v1/prepare-extraction`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ url: urlInput || undefined, text: sanitized }),
          signal: AbortSignal.timeout(20000),
        })
      } catch (err) {
        console.error('[unpack] prepare-extraction (text) failed:', err)
        setStatus('error')
        setErrorMessage("Couldn't process the text. Please try again.")
        if (!sourceEntryId) { cleanupSourceEntry(currentEntryId); setEntryId(null) }
        setStarting(false)
        return
      }

      const prepareData = await prepareRes.json() as {
        success: boolean; chunks?: string[]; title?: string; thumbnail?: string; domain?: string; error?: string
      }

      if (!prepareData.success || !prepareData.chunks?.length) {
        setStatus('error')
        if (prepareData.error === 'content_too_short') {
          setErrorMessage("The pasted text doesn't have enough content to extract places from. Try copying more of the article.")
        } else {
          setErrorMessage("Couldn't process the text. Please try again.")
        }
        if (!sourceEntryId) { cleanupSourceEntry(currentEntryId); setEntryId(null) }
        setStarting(false)
        return
      }

      const { chunks, title: articleTitle } = prepareData
      if (!preview?.title && articleTitle) {
        setPreview(prev => prev ? { ...prev, title: articleTitle } : { title: articleTitle, image: null, description: null, site_name: null })
      }

      setStatus('extracting')

      // Extract each chunk (identical to handleStart)
      const allItems: ExtractedDisplayItem[] = []
      const seenNames = new Set<string>()

      for (let i = 0; i < chunks.length; i++) {
        if (cancelledRef.current) return

        try {
          const chunkRes = await fetch(`${supabaseUrl}/functions/v1/extract-chunk`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              chunk: chunks[i],
              title: articleTitle ?? preview?.title ?? (urlInput ? capitalizeDomain(urlInput) : 'Untitled'),
              chunk_index: i,
              total_chunks: chunks.length,
            }),
            signal: AbortSignal.timeout(45000),
          })

          if (cancelledRef.current) return
          if (!chunkRes.ok) { console.error(`[unpack] extract-chunk ${i + 1} failed: HTTP ${chunkRes.status}`); continue }

          const chunkData = await chunkRes.json() as {
            success: boolean; items?: ExtractedDisplayItem[]; item_count?: number
          }

          if (cancelledRef.current) return

          if (chunkData.success && chunkData.items?.length) {
            const newItems: ExtractedDisplayItem[] = []
            for (const item of chunkData.items) {
              const key = item.name.toLowerCase().trim()
              if (!seenNames.has(key)) {
                seenNames.add(key)
                newItems.push(item)
              }
            }
            if (newItems.length > 0) {
              allItems.push(...newItems)
              setItems([...allItems])
              revealItems(newItems)
            }
          }
        } catch (err) {
          if (cancelledRef.current) return
          console.error(`[unpack] Chunk ${i + 1} error:`, err)
        }

        if (cancelledRef.current) return
        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 300))
          if (cancelledRef.current) return
        }
      }

      if (cancelledRef.current) return

      if (allItems.length === 0) {
        setStatus('error')
        setErrorMessage('No places found in the pasted text.')
        if (!sourceEntryId) { cleanupSourceEntry(currentEntryId); setEntryId(null) }
        setStarting(false)
        return
      }

      setStatus('complete')
      setCheckedItems(new Set(allItems.map(item => itemKey(item))))
      setStep('done')
    } catch (err) {
      console.error('[unpack] Text extraction failed:', err)
      setStatus('error')
      setErrorMessage('Something went wrong. Please try again.')
      if (!sourceEntryId) { cleanupSourceEntry(currentEntryId); setEntryId(null) }
      setStarting(false)
    }
  }, [urlInput, user, starting, preview, entryId, toast, sourceEntryId, cleanupSourceEntry, revealItems])

  // ── Save to Horizon (user taps button on completion screen) ──
  const handleSave = useCallback(async () => {
    const selectedItems = items.filter(item => checkedItems.has(itemKey(item)))
    if (!user || !entryId || selectedItems.length === 0 || isSaving) return
    setIsSaving(true)

    try {
      // Write only checked items to pending_extractions
      const { data: extraction, error } = await supabase.from('pending_extractions').insert({
        user_id: user.id,
        source_entry_id: entryId,
        source_url: urlInput,
        extracted_items: selectedItems,
        content_type: 'listicle',
        status: 'complete',
        item_count: selectedItems.length,
      }).select('id').single()

      if (error || !extraction) {
        console.error('[unpack] Failed to store extraction:', error?.message)
        toast('Failed to save')
        setIsSaving(false) // Re-enable only on error
        return
      }

      onComplete(extraction.id, entryId)
      // Do NOT re-enable button — user navigates away on success
    } catch (err) {
      console.error('[unpack] Save failed:', err)
      toast('Failed to save')
      setIsSaving(false) // Re-enable on error for retry
    }
  }, [user, entryId, items, checkedItems, urlInput, toast, onComplete, isSaving])

  // ── Render: group DISPLAYED items by section (progressive reveal) ──
  const sections = displayedItems.reduce<Map<string, ExtractedDisplayItem[]>>((acc, item) => {
    const key = item.section_label || 'Places'
    const group = acc.get(key) ?? []
    group.push(item)
    acc.set(key, group)
    return acc
  }, new Map())

  // ── Render ──
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'var(--bg-canvas)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {step === 'input' ? (
        /* ── Step 1: URL Input + Preview ── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', paddingTop: 'calc(12px + env(safe-area-inset-top))',
          }}>
            <button type="button" onClick={handleClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontFamily: "'DM Sans', sans-serif", fontSize: 14,
            }}>Cancel</button>
            <span style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500,
              color: 'var(--text-tertiary)', textTransform: 'lowercase',
            }}>unpack</span>
          </div>

          <div style={{ padding: '24px 20px 0' }}>
            {inputMode === 'url' ? (
              <>
                <input
                  ref={inputRef}
                  type="url"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="Paste a link to unpack"
                  style={{
                    width: '100%', padding: '14px 16px',
                    background: 'var(--bg-elevated-1)',
                    border: '0.5px solid rgba(118, 130, 142, 0.15)',
                    borderRadius: 10, outline: 'none',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 16,
                    color: 'var(--text-primary)',
                  }}
                />
                <button type="button" onClick={() => setInputMode('text')} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                  color: 'var(--text-tertiary)', marginTop: 8, display: 'block',
                  textAlign: 'center', width: '100%',
                }}>
                  Or paste article text
                </button>
              </>
            ) : (
              <>
                <div style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
                  color: 'var(--text-secondary)', marginBottom: 8,
                }}>
                  Paste article text to unpack
                </div>
                <textarea
                  value={pastedText}
                  onChange={e => { setPastedText(e.target.value); setPasteError(null) }}
                  placeholder="Paste article text here..."
                  style={{
                    width: '100%', minHeight: 160, maxHeight: 300,
                    background: 'var(--bg-elevated-1)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 12, padding: 12, outline: 'none',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 16,
                    color: 'var(--text-primary)', resize: 'vertical',
                  }}
                />
                {pasteError && (
                  <div style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                    color: '#c44a3d', marginTop: 6,
                  }}>
                    {pasteError}
                  </div>
                )}
                <button type="button" onClick={() => setInputMode('url')} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                  color: 'var(--text-tertiary)', marginTop: 8, display: 'block',
                  textAlign: 'center', width: '100%',
                }}>
                  Or paste a link
                </button>
              </>
            )}
          </div>

          {loadingPreview && (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading preview...</span>
            </div>
          )}
          {preview && !loadingPreview && (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {preview.image && (
                <img src={preview.image} alt="" style={{ width: 200, maxWidth: '100%', borderRadius: 8, marginBottom: 12, objectFit: 'cover' }} />
              )}
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', textAlign: 'center', maxWidth: 300 }}>
                {preview.title || urlInput}
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                {extractDomain(urlInput)}
              </div>
            </div>
          )}

          {/* Duplicate URL warning */}
          {duplicateRoute && (
            <div style={{
              margin: '16px 20px', padding: '14px 16px',
              background: 'rgba(184, 68, 30, 0.08)',
              border: '0.5px solid rgba(184, 68, 30, 0.2)',
              borderRadius: 10,
            }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>
                You've already unpacked this as <strong style={{ color: 'var(--accent-primary)' }}>{duplicateRoute.name}</strong>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => {
                  // Navigate to existing Route
                  handleClose()
                  window.location.href = `/route/${duplicateRoute.id}`
                }} style={{
                  flex: 1, padding: '8px 0',
                  background: 'none', border: '1px solid rgba(118, 130, 142, 0.15)',
                  borderRadius: 8, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text-secondary)',
                }}>
                  View existing
                </button>
                <button type="button" onClick={() => {
                  setDuplicateRoute(null)
                  skipDuplicateCheckRef.current = true
                  handleStart()
                }} style={{
                  flex: 1, padding: '8px 0',
                  background: 'var(--accent-primary)', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                }}>
                  Unpack again
                </button>
              </div>
            </div>
          )}

          {inputMode === 'url' && urlInput.length > 10 && !duplicateRoute && (
            <div style={{ padding: '20px', marginTop: 'auto' }}>
              <button type="button" onClick={handleStart} disabled={starting} style={{
                width: '100%', padding: '14px 0',
                background: starting ? 'var(--disabled-bg)' : 'var(--accent-primary)', color: '#fff',
                border: 'none', borderRadius: 12, cursor: starting ? 'default' : 'pointer',
                fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600,
              }}>
                {starting ? 'Starting...' : 'Start'}
              </button>
            </div>
          )}
          {inputMode === 'text' && (
            <div style={{ padding: '20px', marginTop: 'auto' }}>
              <button type="button" onClick={() => handleExtractFromText(pastedText)} disabled={starting || !pastedText.trim()} style={{
                width: '100%', padding: '14px 0',
                background: (starting || !pastedText.trim()) ? 'var(--disabled-bg)' : 'var(--accent-primary)',
                color: (starting || !pastedText.trim()) ? 'var(--disabled-text)' : '#e8eaed',
                border: 'none', borderRadius: 9999, cursor: (starting || !pastedText.trim()) ? 'default' : 'pointer',
                fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
              }}>
                {starting ? 'Starting...' : 'Extract places'}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── Step 2 (processing) + Step 3 (done) ── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', paddingTop: 'calc(10px + env(safe-area-inset-top))',
            borderBottom: '0.5px solid rgba(118, 130, 142, 0.06)',
          }}>
            <button type="button" onClick={handleClose} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              color: 'var(--text-secondary)',
            }}>
              <X size={20} />
            </button>
            {preview?.image && (
              <img src={preview.image} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {preview?.title || (urlInput ? capitalizeDomain(urlInput) : 'Untitled')}
              </div>
              {urlInput && (
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {extractDomain(urlInput)}
                </div>
              )}
            </div>
          </div>

          {/* Counter — uses displayedCount for progressive reveal */}
          <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 36, fontWeight: 500,
              color: 'var(--accent-primary)', lineHeight: 1, overflow: 'hidden', height: 40,
            }}>
              <div key={displayedCount} style={{ animation: displayedCount > 0 ? 'slideUp 200ms ease forwards' : 'none' }}>
                {displayedCount}
              </div>
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
              places found
            </div>
          </div>

          {/* Select all / Deselect all — only in completion state */}
          {step === 'done' && items.length > 0 && (
            <div style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => {
                if (allChecked) setCheckedItems(new Set())
                else setCheckedItems(new Set(items.map(item => itemKey(item))))
              }} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--accent-primary)',
              }}>
                {allChecked ? 'Deselect all' : 'Select all'}
              </button>
            </div>
          )}

          {/* Item list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
            {[...sections.entries()].map(([label, sectionItems]) => (
              <div key={label} style={{ marginBottom: 16 }}>
                <div style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 500,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'var(--text-secondary)',
                  paddingBottom: 6, borderBottom: '0.5px solid rgba(118, 130, 142, 0.1)',
                  marginBottom: 8, marginTop: 4,
                }}>
                  {label}
                </div>
                {sectionItems.map((item, i) => {
                  const key = itemKey(item)
                  const isChecked = step === 'done' ? checkedItems.has(key) : true
                  const showCheckbox = step === 'done'

                  return (
                    <div key={`${label}-${i}`} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0',
                      borderBottom: '0.5px solid rgba(118, 130, 142, 0.06)',
                      animation: 'fadeSlideIn 300ms ease-out forwards',
                      opacity: showCheckbox && !isChecked ? 0.4 : 1,
                      transition: 'opacity 150ms ease',
                    }}>
                      {/* Checkbox — only in completion state */}
                      {showCheckbox && (
                        <button type="button" onClick={() => {
                          setCheckedItems(prev => {
                            const next = new Set(prev)
                            if (next.has(key)) next.delete(key)
                            else next.add(key)
                            return next
                          })
                        }} style={{
                          width: 22, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 2,
                          border: isChecked ? 'none' : '1.5px solid rgba(118, 130, 142, 0.2)',
                          background: isChecked ? 'var(--accent-primary)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', padding: 0,
                        }}>
                          {isChecked && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                          {item.name}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                          <span style={{
                            fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500,
                            background: 'var(--bg-elevated-2)', color: 'var(--text-secondary)',
                            padding: '1px 6px', borderRadius: 9999,
                          }}>
                            {resolveCategoryLabel(item.category)}
                          </span>
                          {item.categories?.includes('creator_fave') && (
                            <span style={{
                              fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 500,
                              background: 'var(--bg-elevated-2)', color: 'var(--text-secondary)',
                              padding: '1px 6px', borderRadius: 9999,
                              display: 'inline-flex', alignItems: 'center', gap: 3, lineHeight: 1,
                            }}>
                              <Heart size={9} fill="currentColor" />
                              Fave
                            </span>
                          )}
                          {extractCity(item.location_name) && (
                            <span style={{
                              fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 500,
                              background: 'rgba(141, 150, 160, 0.20)',
                              color: 'var(--text-tertiary)',
                              padding: '1px 6px', borderRadius: 9999,
                            }}>
                              {extractCity(item.location_name)}
                            </span>
                          )}
                        </div>
                        {item.context && (
                          <div style={{
                            fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                            color: 'var(--text-secondary)',
                            marginTop: 3, lineHeight: 1.4,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                            overflow: 'hidden',
                          }}>
                            {item.context}
                          </div>
                        )}
                      </div>
                      {/* Check icon during processing, hidden in completion (checkbox replaces it) */}
                      {!showCheckbox && <Check size={14} color="#5b8a72" style={{ flexShrink: 0, marginTop: 4 }} />}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div style={{
            padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
            borderTop: '0.5px solid rgba(118, 130, 142, 0.06)',
          }}>
            {status === 'error' && showPasteFallback ? (
              /* Paste fallback — shown when bot challenge or fetch fails */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <AlertTriangle size={20} color="var(--color-warning, #c49a2d)" style={{ flexShrink: 0 }} />
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                    This site is blocking automated access
                  </span>
                </div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                  You can paste the article content below and we'll extract places from it.
                </p>
                <textarea
                  value={pastedText}
                  onChange={e => { setPastedText(e.target.value); setPasteError(null) }}
                  placeholder="Paste article text here..."
                  style={{
                    width: '100%', minHeight: 160, maxHeight: 300,
                    background: 'var(--bg-elevated-1)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 12, padding: 12, outline: 'none',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 16,
                    color: 'var(--text-primary)', resize: 'vertical',
                  }}
                />
                {pasteError && (
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#c44a3d', marginTop: 6 }}>
                    {pasteError}
                  </div>
                )}
                <button type="button" onClick={() => handleExtractFromText(pastedText)} disabled={starting || !pastedText.trim()} style={{
                  width: '100%', padding: 12, marginTop: 12,
                  background: (starting || !pastedText.trim()) ? 'var(--disabled-bg)' : 'var(--accent-primary)',
                  color: (starting || !pastedText.trim()) ? 'var(--disabled-text)' : '#e8eaed',
                  border: 'none', borderRadius: 9999, cursor: (starting || !pastedText.trim()) ? 'default' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
                }}>
                  {starting ? 'Starting...' : 'Extract places'}
                </button>
              </div>
            ) : status === 'error' ? (
              /* Regular error state */
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#c44a3d' }}>
                  {errorMessage ?? 'Something went wrong.'}
                </span>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
                  <button type="button" onClick={handleClose} style={{
                    padding: '8px 20px', background: 'none',
                    border: '1px solid rgba(118, 130, 142, 0.06)',
                    borderRadius: 8, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text-secondary)',
                  }}>Cancel</button>
                  <button type="button" onClick={() => { setStep('input'); setStatus('reading'); setErrorMessage(null); setItems([]); setItemCount(0); setPrevCount(0); setStarting(false); setDisplayedItems([]); setDisplayedCount(0); revealQueueRef.current = []; revealingRef.current = false; setShowPasteFallback(false) }} style={{
                    padding: '8px 20px', background: 'var(--accent-primary)', color: '#fff',
                    border: 'none', borderRadius: 8, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                  }}>Try again</button>
                </div>
              </div>
            ) : step === 'done' ? (
              /* Completion state — stays until user taps */
              <div>
                <button type="button" onClick={handleSave} disabled={isSaving || checkedItems.size === 0} style={{
                  width: '100%', padding: '14px 0',
                  background: (isSaving || checkedItems.size === 0) ? 'var(--disabled-bg)' : 'var(--accent-primary)', color: '#fff',
                  border: 'none', borderRadius: 12,
                  cursor: (isSaving || checkedItems.size === 0) ? 'default' : 'pointer',
                  opacity: (isSaving || checkedItems.size === 0) ? 0.5 : 1,
                  fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600,
                }}>
                  {isSaving ? 'Saving...' : `Save to Horizon (${checkedItems.size} items)`}
                </button>
                <button type="button" onClick={handleClose} style={{
                  width: '100%', padding: '10px 0', marginTop: 4,
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                  color: 'var(--text-secondary)',
                }}>
                  Cancel
                </button>
              </div>
            ) : (
              /* Processing state */
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', animation: 'pulse 1.5s ease infinite' }} />
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text-secondary)' }}>
                  {status === 'reading' ? 'Reading article...' : 'Extracting places...'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeSlideIn {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
