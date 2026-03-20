import { useAuth } from '../lib/auth'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { BrandMark, ConfirmDeleteModal } from '../components/ui'

export default function ProfilePage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [deleteStep, setDeleteStep] = useState<'none' | 'confirm' | 'type-delete'>('none')
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteInputRef = useRef<HTMLInputElement>(null)

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split('@')[0] ??
    'User'
  const email = user?.email ?? ''
  const avatarUrl: string | undefined = user?.user_metadata?.avatar_url
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase() ?? '')
    .join('') || '?'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  // Focus input when step 2 opens
  useEffect(() => {
    if (deleteStep === 'type-delete') {
      setTimeout(() => deleteInputRef.current?.focus(), 100)
    }
  }, [deleteStep])

  // Close on Escape for step 2
  useEffect(() => {
    if (deleteStep !== 'type-delete') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDeleteStep('none')
        setDeleteInput('')
        setDeleteError(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [deleteStep])

  const handleDeleteAccount = async () => {
    if (!user) return
    setDeleting(true)
    setDeleteError(null)

    try {
      // Cascade delete all user data in FK-safe order

      // 1. Get all trip IDs owned by user
      const { data: trips } = await supabase.from('trips').select('id').eq('owner_id', user.id)
      const tripIds = (trips ?? []).map((t: { id: string }) => t.id)

      if (tripIds.length > 0) {
        // 2. Get all destination IDs for user's trips
        const { data: dests } = await supabase.from('trip_destinations').select('id').in('trip_id', tripIds)
        const destIds = (dests ?? []).map((d: { id: string }) => d.id)

        if (destIds.length > 0) {
          await supabase.from('destination_items').delete().in('destination_id', destIds)
        }

        // 3. Delete trip-level data
        await supabase.from('trip_general_items').delete().in('trip_id', tripIds)
        await supabase.from('comments').delete().in('trip_id', tripIds)
        await supabase.from('votes').delete().in('trip_id', tripIds)
        await supabase.from('companions').delete().in('trip_id', tripIds)
        await supabase.from('trip_routes').delete().in('trip_id', tripIds)
        await supabase.from('trip_destinations').delete().in('trip_id', tripIds)
        await supabase.from('trips').delete().in('id', tripIds)
      }

      // 4. Delete companions where user is a companion on others' trips
      await supabase.from('companions').delete().eq('user_id', user.id)

      // 5. Delete comments/votes on others' trips
      await supabase.from('comments').delete().eq('user_id', user.id)
      await supabase.from('votes').delete().eq('user_id', user.id)

      // 6. Delete all saved items
      await supabase.from('saved_items').delete().eq('user_id', user.id)

      // 7. Delete user profile
      await supabase.from('users').delete().eq('id', user.id)

      // 8. Sign out and redirect
      await signOut()
      navigate('/login')
    } catch (err) {
      console.error('[ProfilePage] Failed to delete account:', err)
      setDeleteError('Something went wrong. Please try again.')
      setDeleting(false)
    }
  }

  return (
    <div className="px-5 pb-32" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}>
      <BrandMark className="mb-4 block" />

      {/* Profile card */}
      <div className="flex flex-col items-center text-center mb-8">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow-md mb-4"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-accent-light text-accent flex items-center justify-center text-2xl font-bold ring-4 ring-white shadow-md mb-4">
            {initials}
          </div>
        )}
        <h1 className="text-lg font-semibold text-text-primary">{displayName}</h1>
        <p className="text-sm text-text-faint mt-0.5">{email}</p>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-3 bg-bg-card rounded-xl border border-border-subtle shadow-sm hover:bg-bg-muted active:bg-bg-pill transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-text-faint">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="text-sm font-medium text-text-secondary">Log Out</span>
        </button>
      </div>

      {/* Delete account button */}
      <button
        type="button"
        onClick={() => setDeleteStep('confirm')}
        className="w-full mt-10 py-3 rounded-xl text-sm font-medium border transition-colors bg-white hover:bg-red-50"
        style={{ borderColor: '#c0392b', color: '#c0392b' }}
      >
        Delete Account
      </button>

      {/* Version */}
      <p className="mt-6 text-center text-xs text-text-ghost">Youji v0.1</p>

      {/* Step 1: Confirm intent */}
      {deleteStep === 'confirm' && (
        <ConfirmDeleteModal
          title="Delete your account?"
          description="This will permanently delete your account and all your data — trips, saves, and settings. This action cannot be undone."
          confirmLabel="Continue"
          onCancel={() => setDeleteStep('none')}
          onConfirm={() => {
            setDeleteStep('type-delete')
            setDeleteInput('')
            setDeleteError(null)
          }}
        />
      )}

      {/* Step 2: Type DELETE to confirm */}
      {deleteStep === 'type-delete' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setDeleteStep('none')
              setDeleteInput('')
              setDeleteError(null)
            }
          }}
        >
          <div
            className="bg-white rounded-[14px] w-full shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
            style={{ maxWidth: 340, padding: 24 }}
          >
            <h2 className="text-[18px] font-semibold text-text-primary leading-snug">
              Are you sure?
            </h2>
            <p className="mt-2 text-[14px] text-text-secondary leading-relaxed">
              Type <span className="font-bold text-text-primary">DELETE</span> to permanently delete your account.
            </p>
            <input
              ref={deleteInputRef}
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="Type DELETE"
              className="w-full mt-3 px-3 py-2.5 border border-border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent placeholder:text-text-faint"
              disabled={deleting}
            />
            {deleteError && (
              <p className="mt-2 text-xs text-error">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => {
                  setDeleteStep('none')
                  setDeleteInput('')
                  setDeleteError(null)
                }}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-text-secondary bg-bg-muted hover:bg-bg-pill-dark transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteInput !== 'DELETE' || deleting}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#c0392b' }}
              >
                {deleting ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
