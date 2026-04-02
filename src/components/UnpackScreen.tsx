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
  /** Pre-fill URL (when launching from an existing save) */
  initialUrl?: string
  /** Pre-fill preview (when launching from an existing save) */
  initialPreview?: { title: string | null; image: string | null; site_name: string | null }
  /** Existing entry ID (when scanning an existing save — skip quick-save) */
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
  const parts = locationName.split(',')
  return parts[0]?.trim() || null
}

// ── Component ────────────────────────────────────────────────────────────────

export default function UnpackScreen({ onClose, onComplete, initialUrl, initialPreview, sourceEntryId }: UnpackScreenProps) {
  const { user } = useAuth()
  const { toast } = useToast()

  // Step state
  const [step, setStep] = useState<'input' | 'processing'>('input')
  const [visible, setVisible] = useState(false)

  // Step 1 state
  const [urlInput, setUrlInput] = useState(initialUrl ?? '')
  const [preview, setPreview] = useState<OgPreview | null>(
    initialPreview ? { title: initialPreview.title, image: initialPreview.image, description: null, site_name: initialPreview.site_name } : null
  )
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [starting, setStarting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Step 2 state
  const [items, setItems] = useState<ExtractedDisplayItem[]>([])
  const [itemCount, setItemCount] = useState(0)
  const [prevCount, setPrevCount] = useState(0)
  const [status, setStatus] = useState<'reading' | 'extracting' | 'complete' | 'failed'>('reading')
  const [extractionId, setExtractionId] = useState<string | null>(null)
  const [, setEntryId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    inputRef.current?.focus()
  }, [])

  const handleClose = useCallback(() => {
    // Cancel polling
    if (pollRef.current) clearInterval(pollRef.current)
    // If processing, mark as cancelled
    if (extractionId) {
      supabase.from('pending_extractions').update({ status: 'cancelled' }).eq('id', extractionId).then(() => {})
    }
    setVisible(false)
    setTimeout(onClose, 200)
  }, [extractionId, onClose])

  // ── Step 1: OG preview fetch ──
  useEffect(() => {
    if (!urlInput || urlInput.length < 10) { setPreview(null); return }
    let isUrl = false
    try { new URL(urlInput); isUrl = true } catch { /* not a URL */ }
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

  // ── Step 1: Start extraction ──
  const handleStart = useCallback(async () => {
    if (!urlInput || !user || starting) return
    setStarting(true)

    try {
      let entryIdToUse: string

      if (sourceEntryId) {
        // Launching from an existing save — don't create a new entry
        entryIdToUse = sourceEntryId
      } else {
        // Quick-save the URL as a regular entry
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
          console.error('[unpack] Save failed:', error?.message)
          toast('Failed to save URL')
          setStarting(false)
          return
        }
        entryIdToUse = entry.id
      }

      setEntryId(entryIdToUse)

      // Call Edge Function (fire and forget — it writes to pending_extractions)
      const session = (await supabase.auth.getSession()).data.session
      if (!session) { setStarting(false); return }
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

      fetch(`${supabaseUrl}/functions/v1/extract-multi-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({
          url: urlInput,
          user_id: user.id,
          entry_id: entryIdToUse,
          source_content: preview?.source_content || null,
        }),
      }).catch(err => console.error('[unpack] Edge Function call failed:', err))

      // Transition to processing
      setStep('processing')
      setStatus('reading')

      // Start polling
      pollRef.current = setInterval(async () => {
        const { data } = await supabase
          .from('pending_extractions')
          .select('id, status, item_count, extracted_items')
          .eq('source_entry_id', entryIdToUse)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!data) return

        if (!extractionId) setExtractionId(data.id)

        const newItems = Array.isArray(data.extracted_items) ? data.extracted_items as ExtractedDisplayItem[] : []
        const newCount = data.item_count ?? newItems.length

        if (newCount > itemCount) {
          setPrevCount(itemCount)
          setItemCount(newCount)
          setItems(newItems)
          if (status === 'reading') setStatus('extracting')
        }

        if (data.status === 'complete') {
          setStatus('complete')
          setItemCount(newCount)
          setItems(newItems)
          if (pollRef.current) clearInterval(pollRef.current)
          // Trigger Route creation after a moment
          setTimeout(() => onComplete(data.id, entryIdToUse), 1500)
        }

        if (data.status === 'failed') {
          setStatus('failed')
          if (pollRef.current) clearInterval(pollRef.current)
        }
      }, 2000)

    } catch (err) {
      console.error('[unpack] Start failed:', err)
      toast('Something went wrong')
      setStarting(false)
    }
  }, [urlInput, user, starting, preview, toast, onComplete, extractionId, itemCount, status])

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

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
          {/* Top bar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', paddingTop: 'calc(12px + env(safe-area-inset-top))',
          }}>
            <button type="button" onClick={handleClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-secondary, #8088a0)',
              fontFamily: "'DM Sans', sans-serif", fontSize: 14,
            }}>
              Cancel
            </button>
            <span style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500,
              color: 'var(--color-text-tertiary, #4a5068)', textTransform: 'lowercase',
            }}>
              unpack
            </span>
          </div>

          {/* URL input */}
          <div style={{ padding: '24px 20px 0' }}>
            <input
              ref={inputRef}
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="Paste an article or video URL"
              style={{
                width: '100%', padding: '14px 16px',
                background: 'var(--color-surface, #141828)',
                border: '0.5px solid var(--color-surface-elevated, #1c2035)',
                borderRadius: 10, outline: 'none',
                fontFamily: "'DM Sans', sans-serif", fontSize: 16,
                color: 'var(--color-text-primary, #e4e8f0)',
              }}
            />
          </div>

          {/* OG Preview */}
          {loadingPreview && (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Loading preview...</span>
            </div>
          )}
          {preview && !loadingPreview && (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {preview.image && (
                <img
                  src={preview.image}
                  alt=""
                  style={{ width: 200, maxWidth: '100%', borderRadius: 8, marginBottom: 12, objectFit: 'cover' }}
                />
              )}
              <div style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 500,
                color: 'var(--color-text-primary, #e4e8f0)',
                textAlign: 'center', maxWidth: 300,
              }}>
                {preview.title || urlInput}
              </div>
              <div style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                color: 'var(--color-text-secondary, #8088a0)',
                marginTop: 4,
              }}>
                {extractDomain(urlInput)}
              </div>
            </div>
          )}

          {/* Start button */}
          {urlInput.length > 10 && (
            <div style={{ padding: '20px', marginTop: 'auto' }}>
              <button
                type="button"
                onClick={handleStart}
                disabled={starting}
                style={{
                  width: '100%', padding: '14px 0',
                  background: starting ? '#8a4020' : '#c45a2d', color: '#fff',
                  border: 'none', borderRadius: 12, cursor: starting ? 'default' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600,
                }}
              >
                {starting ? 'Starting...' : 'Start'}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── Step 2: Processing ── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top bar: cancel + compact article card */}
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
              <div style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
                color: 'var(--color-text-primary, #e4e8f0)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
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
              color: '#c45a2d', lineHeight: 1,
              overflow: 'hidden', height: 40,
            }}>
              <div
                key={itemCount}
                style={{
                  animation: itemCount > prevCount ? 'slideUp 200ms ease forwards' : 'none',
                }}
              >
                {itemCount}
              </div>
            </div>
            <div style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              color: 'var(--color-text-secondary, #8088a0)', marginTop: 4,
            }}>
              places found
            </div>
          </div>

          {/* Item list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
            {[...sections.entries()].map(([label, sectionItems]) => (
              <div key={label} style={{ marginBottom: 16 }}>
                {/* Section header */}
                <div style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: 'var(--color-text-secondary, #8088a0)',
                  paddingBottom: 6, borderBottom: '0.5px solid var(--color-surface-elevated, #1c2035)',
                  marginBottom: 8,
                }}>
                  {label}
                </div>

                {/* Items */}
                {sectionItems.map((item, i) => (
                  <div
                    key={`${label}-${i}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 0',
                      borderBottom: '0.5px solid var(--color-surface-elevated, #1c2035)',
                      animation: 'fadeSlideIn 200ms ease forwards',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
                        color: 'var(--color-text-primary, #e4e8f0)',
                      }}>
                        {item.name}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                        <span style={{
                          fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 500,
                          background: 'rgba(196, 90, 45, 0.15)', color: '#c45a2d',
                          padding: '1px 6px', borderRadius: 4,
                        }}>
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                        {extractCity(item.location_name) && (
                          <span style={{
                            fontFamily: "'DM Sans', sans-serif", fontSize: 10,
                            background: 'var(--color-surface-elevated, #1c2035)',
                            color: 'var(--color-text-secondary, #8088a0)',
                            padding: '1px 6px', borderRadius: 4,
                          }}>
                            {extractCity(item.location_name)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Check size={14} color="#5b8a72" style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Bottom status */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
            borderTop: '0.5px solid var(--color-surface-elevated, #1c2035)',
          }}>
            {status !== 'complete' && status !== 'failed' && (
              <div style={{
                width: 6, height: 6, borderRadius: '50%', background: '#c45a2d',
                animation: 'pulse 1.5s ease infinite',
              }} />
            )}
            <span style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              color: status === 'complete' ? '#5b8a72'
                : status === 'failed' ? '#c44a3d'
                : 'var(--color-text-secondary, #8088a0)',
            }}>
              {status === 'reading' ? 'Reading article...'
                : status === 'extracting' ? 'Extracting places...'
                : status === 'complete' ? `Complete — ${itemCount} places found`
                : 'Extraction failed'}
            </span>
          </div>
        </div>
      )}

      {/* CSS animations */}
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
