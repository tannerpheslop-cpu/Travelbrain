import { useAuth } from '../lib/auth'

export default function UserHeader() {
  const { user, signOut } = useAuth()

  if (!user) return null

  const displayName = user.user_metadata?.full_name || user.user_metadata?.name
  const email = user.email
  const avatarUrl = user.user_metadata?.avatar_url

  // Get initials for fallback avatar
  const initials = displayName
    ? displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : email?.charAt(0).toUpperCase() ?? '?'

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
      <div className="flex items-center gap-3 min-w-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Avatar"
            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {initials}
          </div>
        )}
        <span className="text-sm text-gray-700 truncate">
          {displayName || email}
        </span>
      </div>
      <button
        onClick={signOut}
        className="text-sm text-gray-500 hover:text-gray-700 flex-shrink-0 ml-3"
      >
        Sign out
      </button>
    </div>
  )
}
