import { useAuth } from '../lib/auth'

export default function UserHeader() {
  const { user, signOut } = useAuth()

  if (!user) return null

  const displayName = user.user_metadata?.full_name || user.user_metadata?.name
  const email = user.email
  const avatarUrl = user.user_metadata?.avatar_url

  const initials = displayName
    ? displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : email?.charAt(0).toUpperCase() ?? '?'

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* App logo + user info */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
            <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 019.75 22.5a.75.75 0 01-.75-.75v-4.131A15.838 15.838 0 016.382 15H2.25a.75.75 0 01-.75-.75 6.75 6.75 0 017.815-6.666zM15 6.75a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Avatar"
              className="w-7 h-7 rounded-full object-cover shrink-0 ring-2 ring-gray-100"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
          )}
          <span className="text-sm text-gray-600 truncate font-medium">
            {displayName || email}
          </span>
        </div>
      </div>
      <button
        onClick={signOut}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-3 px-2.5 py-1.5 rounded-lg hover:bg-gray-100"
      >
        Sign out
      </button>
    </div>
  )
}
