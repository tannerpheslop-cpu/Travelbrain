import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Check } from 'lucide-react'
import { supabase, supabaseUrl, invokeEdgeFunction } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from './Toast'
import type { Category } from '../types'

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

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: 'Food', hotel: 'Stay', museum: 'Museum', temple: 'Temple',
  park: 'Park', hike: 'Hike', historical: 'Historical', shopping: 'Shopping',
  nightlife: 'Nightlife', entertainment: 'Fun', transport: 'Transport',
  spa: 'Spa', beach: 'Beach', other: 'Place',
}

function extractCity(locationName: string | null): string | null {
  if (!locationName) return null
  return locationName.split(',')[0]?.trim() || null
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

  // Step 2 + 3
  const [items, setItems] = useState<ExtractedDisplayItem[]>([])
  const [itemCount, setItemCount] = useState(0)
  const [prevCount, setPrevCount] = useState(0)
  const [status, setStatus] = useState<Status>('reading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [entryId, setEntryId] = useState<string | null>(sourceEntryId ?? null)
  const cancelledRef = useRef(false)

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    inputRef.current?.focus()
  }, [])

  const handleClose = useCallback(() => {
    cancelledRef.current = true
    setVisible(false)
    setTimeout(onClose, 200)
  }, [onClose])

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
    cancelledRef.current = false

    try {
      // Quick-save the URL if no existing entry
      let currentEntryId = entryId
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
          category: 'other' as Category,
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
        return
      }

      if (!prepareRes.ok) {
        setStatus('error')
        setErrorMessage("Couldn't read the article. Please try again.")
        return
      }

      const prepareData = await prepareRes.json() as {
        success: boolean; chunks?: string[]; title?: string; thumbnail?: string; domain?: string; error?: string
      }

      if (!prepareData.success || !prepareData.chunks?.length) {
        setStatus('error')
        setErrorMessage(prepareData.error === 'content_too_short' ? 'Article is too short to extract places from.' : "Couldn't read the article.")
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
              setPrevCount(itemCount)
              setItemCount(allItems.length)
              setItems([...allItems])
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
        return
      }

      // Step 3: Done — show completion screen
      setStatus('complete')
      setStep('done')

    } catch (err) {
      console.error('[unpack] Start failed:', err)
      setStatus('error')
      setErrorMessage('Something went wrong. Please try again.')
    }
  }, [urlInput, user, starting, preview, entryId, toast, itemCount])

  // ── Save to Horizon (user taps button on completion screen) ──
  const handleSave = useCallback(async () => {
    if (!user || !entryId || items.length === 0) return

    // Write to pending_extractions so createRouteFromExtraction can read it
    const { data: extraction, error } = await supabase.from('pending_extractions').insert({
      user_id: user.id,
      source_entry_id: entryId,
      source_url: urlInput,
      extracted_items: items,
      content_type: 'listicle',
      status: 'complete',
      item_count: items.length,
    }).select('id').single()

    if (error || !extraction) {
      console.error('[unpack] Failed to store extraction:', error?.message)
      toast('Failed to save')
      return
    }

    onComplete(extraction.id, entryId)
  }, [user, entryId, items, urlInput, toast, onComplete])

  // ── Render: group items by section ──
  const sections = items.reduce<Map<string, ExtractedDisplayItem[]>>((acc, item) => {
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
        background: 'var(--color-deep-bg, #080c18)',
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
              color: '#b8c8e0',
              fontFamily: "'DM Sans', sans-serif", fontSize: 14,
            }}>Cancel</button>
            <span style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500,
              color: 'var(--color-text-tertiary, #4a5068)', textTransform: 'lowercase',
            }}>unpack</span>
          </div>

          <div style={{ padding: '24px 20px 0' }}>
            <input
              ref={inputRef}
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="Paste a link or article text"
              style={{
                width: '100%', padding: '14px 16px',
                background: '#1c2035',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: 10, outline: 'none',
                fontFamily: "'DM Sans', sans-serif", fontSize: 16,
                color: '#e4e8f0',
              }}
            />
            <div style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 12,
              color: '#8088a0', marginTop: 8, textAlign: 'center',
            }}>
              Find restaurants, attractions, and more
            </div>
          </div>

          {loadingPreview && (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Loading preview...</span>
            </div>
          )}
          {preview && !loadingPreview && (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {preview.image && (
                <img src={preview.image} alt="" style={{ width: 200, maxWidth: '100%', borderRadius: 8, marginBottom: 12, objectFit: 'cover' }} />
              )}
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary, #e4e8f0)', textAlign: 'center', maxWidth: 300 }}>
                {preview.title || urlInput}
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--color-text-secondary, #8088a0)', marginTop: 4 }}>
                {extractDomain(urlInput)}
              </div>
            </div>
          )}

          {urlInput.length > 10 && (
            <div style={{ padding: '20px', marginTop: 'auto' }}>
              <button type="button" onClick={handleStart} disabled={starting} style={{
                width: '100%', padding: '14px 0',
                background: starting ? '#8a4020' : '#c45a2d', color: '#fff',
                border: 'none', borderRadius: 12, cursor: starting ? 'default' : 'pointer',
                fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600,
              }}>
                {starting ? 'Starting...' : 'Start'}
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
            borderBottom: '0.5px solid var(--color-surface-elevated, #1c2035)',
          }}>
            <button type="button" onClick={handleClose} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              color: 'var(--color-text-secondary, #8088a0)',
            }}>
              <X size={20} />
            </button>
            {preview?.image && (
              <img src={preview.image} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #e4e8f0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {preview?.title || urlInput}
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--color-text-secondary)' }}>
                {extractDomain(urlInput)}
              </div>
            </div>
          </div>

          {/* Counter */}
          <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 36, fontWeight: 500,
              color: '#c45a2d', lineHeight: 1, overflow: 'hidden', height: 40,
            }}>
              <div key={itemCount} style={{ animation: itemCount > prevCount ? 'slideUp 200ms ease forwards' : 'none' }}>
                {itemCount}
              </div>
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--color-text-secondary, #8088a0)', marginTop: 4 }}>
              places found
            </div>
          </div>

          {/* Item list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
            {[...sections.entries()].map(([label, sectionItems]) => (
              <div key={label} style={{ marginBottom: 16 }}>
                <div style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: 'var(--color-text-secondary, #8088a0)',
                  paddingBottom: 6, borderBottom: '0.5px solid var(--color-surface-elevated, #1c2035)',
                  marginBottom: 8, marginTop: 4,
                }}>
                  {label}
                </div>
                {sectionItems.map((item, i) => (
                  <div key={`${label}-${i}`} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0',
                    borderBottom: '0.5px solid var(--color-surface-elevated, #1c2035)',
                    animation: 'fadeSlideIn 200ms ease forwards',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary, #e4e8f0)' }}>
                        {item.name}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                        <span style={{
                          fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 500,
                          background: 'rgba(196, 90, 45, 0.12)', color: '#c45a2d',
                          padding: '2px 8px', borderRadius: 999,
                        }}>
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                        {extractCity(item.location_name) && (
                          <span style={{
                            fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 500,
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--color-text-secondary, #8088a0)',
                            padding: '2px 8px', borderRadius: 999,
                          }}>
                            {extractCity(item.location_name)}
                          </span>
                        )}
                      </div>
                      {item.context && (
                        <div style={{
                          fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                          color: 'var(--color-text-secondary, #8088a0)',
                          marginTop: 3, lineHeight: 1.4,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                          overflow: 'hidden',
                        }}>
                          {item.context}
                        </div>
                      )}
                    </div>
                    <Check size={14} color="#5b8a72" style={{ flexShrink: 0, marginTop: 4 }} />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div style={{
            padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
            borderTop: '0.5px solid var(--color-surface-elevated, #1c2035)',
          }}>
            {status === 'error' ? (
              /* Error state */
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#c44a3d' }}>
                  {errorMessage ?? 'Something went wrong.'}
                </span>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
                  <button type="button" onClick={handleClose} style={{
                    padding: '8px 20px', background: 'none',
                    border: '1px solid var(--color-surface-elevated, #1c2035)',
                    borderRadius: 8, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--color-text-secondary, #8088a0)',
                  }}>Cancel</button>
                  <button type="button" onClick={() => { setStep('input'); setStatus('reading'); setErrorMessage(null); setItems([]); setItemCount(0); setPrevCount(0); setStarting(false) }} style={{
                    padding: '8px 20px', background: '#c45a2d', color: '#fff',
                    border: 'none', borderRadius: 8, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                  }}>Try again</button>
                </div>
              </div>
            ) : step === 'done' ? (
              /* Completion state — stays until user taps */
              <div>
                <button type="button" onClick={handleSave} style={{
                  width: '100%', padding: '14px 0',
                  background: '#c45a2d', color: '#fff',
                  border: 'none', borderRadius: 12, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600,
                }}>
                  Save to Horizon
                </button>
                <button type="button" onClick={handleClose} style={{
                  width: '100%', padding: '10px 0', marginTop: 4,
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                  color: 'var(--color-text-secondary, #8088a0)',
                }}>
                  Cancel
                </button>
              </div>
            ) : (
              /* Processing state */
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#c45a2d', animation: 'pulse 1.5s ease infinite' }} />
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--color-text-secondary, #8088a0)' }}>
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
          from { transform: translateY(8px); opacity: 0; }
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
