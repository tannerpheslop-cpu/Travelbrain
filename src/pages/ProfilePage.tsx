import { useAuth } from '../lib/auth'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { BrandMark } from '../components/ui'

export default function ProfilePage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

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

      {/* Delete account link */}
      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={() => setShowDeleteDialog(true)}
          className="text-xs text-text-faint hover:text-error transition-colors"
        >
          Delete Account
        </button>
      </div>

      {/* Version */}
      <p className="mt-6 text-center text-xs text-text-ghost">Youji v0.1</p>

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteDialog(false) }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-bg-card rounded-2xl shadow-xl max-w-sm mx-6 p-6 text-center">
            <h3 className="text-base font-semibold text-text-primary mb-2">Delete Account</h3>
            <p className="text-sm text-text-tertiary mb-5">
              To delete your account and all associated data, please contact support at{' '}
              <span className="font-medium text-text-secondary">support@youji.app</span>
            </p>
            <button
              type="button"
              onClick={() => setShowDeleteDialog(false)}
              className="px-5 py-2 bg-bg-muted text-text-secondary rounded-xl text-sm font-medium hover:bg-bg-pill-dark transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
