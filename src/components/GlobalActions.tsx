import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Bookmark, PackageOpen } from 'lucide-react'
import SaveSheet from './SaveSheet'
import UnpackScreen from './UnpackScreen'
import { createRouteFromExtraction } from '../lib/createRouteFromExtraction'
import { useAuth } from '../lib/auth'
import { useToast } from './Toast'

/** FAB is ONLY visible on the Horizon page (/inbox) */
const FAB_VISIBLE_PATHS = ['/inbox']

export default function GlobalActions() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()
  const showFab = FAB_VISIBLE_PATHS.includes(location.pathname)
  const [showMenu, setShowMenu] = useState(false)
  const [menuVisible, setMenuVisible] = useState(false)
  const [showSaveSheet, setShowSaveSheet] = useState(false)
  const [showUnpack, setShowUnpack] = useState(false)

  // Animate menu in
  useEffect(() => {
    if (showMenu) {
      requestAnimationFrame(() => setMenuVisible(true))
    } else {
      setMenuVisible(false)
    }
  }, [showMenu])

  const handleFabTap = useCallback(() => {
    if (showUnpack) return // Don't interfere with Unpack screen
    if (showSaveSheet) {
      setShowSaveSheet(false)
      return
    }
    if (showMenu) {
      setShowMenu(false)
      return
    }
    setShowMenu(true)
  }, [showMenu, showSaveSheet, showUnpack])

  const handleQuickSave = useCallback(() => {
    setShowMenu(false)
    setMenuVisible(false)
    // Small delay so menu closes before sheet opens
    setTimeout(() => setShowSaveSheet(true), 50)
  }, [])

  const handleUnpack = useCallback(() => {
    setShowMenu(false)
    setMenuVisible(false)
    setTimeout(() => setShowUnpack(true), 50)
  }, [])

  const dismissMenu = useCallback(() => {
    setMenuVisible(false)
    setTimeout(() => setShowMenu(false), 200)
  }, [])

  return (
    <>
      {/* FAB — only visible on Horizon page (/inbox) */}
      {showFab && (
        <div
          className="fixed z-25 right-4 pointer-events-none"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 1rem)' }}
        >
          <button
            type="button"
            onClick={handleFabTap}
            className="pointer-events-auto w-13 h-13 rounded-full bg-accent text-white shadow-lg shadow-accent/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            aria-label={showSaveSheet || showMenu ? 'Close' : 'Add save'}
          >
            <div className="transition-transform duration-200" style={{ transform: showMenu || showSaveSheet ? 'rotate(45deg)' : 'none' }}>
              <Plus className="w-6 h-6" />
            </div>
          </button>
        </div>
      )}

      {/* FAB Menu — two options */}
      {showMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            style={{
              background: menuVisible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)',
              transition: 'background 200ms ease',
            }}
            onClick={dismissMenu}
          />

          {/* Menu sheet */}
          <div
            className="fixed inset-x-0 bottom-0 z-50"
            style={{
              transform: menuVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 200ms ease-out',
            }}
          >
            <div
              style={{
                background: 'var(--color-surface, #0d1a2a)',
                borderRadius: '16px 16px 0 0',
                padding: '8px 0',
                paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Quick save option */}
              <button
                type="button"
                onClick={handleQuickSave}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  width: '100%', padding: '14px 20px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(184, 68, 30, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Bookmark size={20} color="#B8441E" />
                </div>
                <div>
                  <div style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500,
                    color: '#e4e8f0',
                  }}>
                    Quick save
                  </div>
                  <div style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                    color: '#b8c8e0',
                    marginTop: 1,
                  }}>
                    Save a link, note, or photo
                  </div>
                </div>
              </button>

              {/* Divider */}
              <div style={{
                height: 0.5, margin: '0 20px',
                background: 'var(--color-surface-elevated, #3F3A42)',
              }} />

              {/* Unpack option */}
              <button
                type="button"
                onClick={handleUnpack}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  width: '100%', padding: '14px 20px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(184, 68, 30, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <PackageOpen size={20} color="#B8441E" />
                </div>
                <div>
                  <div style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500,
                    color: '#e4e8f0',
                  }}>
                    Unpack
                  </div>
                  <div style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                    color: '#b8c8e0',
                    marginTop: 1,
                  }}>
                    Turn any travel article into a list of places to visit
                  </div>
                </div>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Unified save sheet — opens from Quick Save menu option */}
      {showSaveSheet && (
        <SaveSheet
          onClose={() => setShowSaveSheet(false)}
          onSaved={() => {
            window.dispatchEvent(new CustomEvent('horizon-item-created'))
          }}
        />
      )}

      {/* Unpack screen — full-screen extraction flow */}
      {showUnpack && (
        <UnpackScreen
          onClose={() => setShowUnpack(false)}
          onComplete={async (extractionId, entryId) => {
            if (!user) return

            // Read source metadata from the saved entry
            const { data: entry } = await (await import('../lib/supabase')).supabase
              .from('saved_items')
              .select('source_url, title, image_url, site_name, source_content')
              .eq('id', entryId)
              .single()

            // Create Route from extraction results
            const result = await createRouteFromExtraction(
              extractionId,
              user.id,
              entry?.source_url ?? '',
              entry?.title ?? null,
              entry?.image_url ?? null,
              entry?.site_name ?? null,
            )

            setShowUnpack(false)
            window.dispatchEvent(new CustomEvent('horizon-item-created'))

            if (result) {
              toast(`Created group with ${result.itemCount} places`)
              // Navigate to Route detail
              navigate(`/route/${result.routeId}`)
            } else {
              toast('Failed to create group')
            }
          }}
        />
      )}
    </>
  )
}
