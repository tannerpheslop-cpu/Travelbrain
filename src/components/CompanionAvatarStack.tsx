import type { CompanionWithUser } from '../hooks/useCompanions'

const AVATAR_COLORS = [
  '#B8441E', '#2d8c6e', '#5a6abf', '#b5593d', '#7c5cbf',
  '#3d8bb5', '#bf5c8a', '#6b8c2d', '#8c6b2d', '#2d6b8c',
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function getAvatarColor(identifier: string): string {
  return AVATAR_COLORS[hashString(identifier) % AVATAR_COLORS.length]
}

function getInitial(companion: CompanionWithUser): string {
  const name = companion.user?.display_name ?? companion.user?.email ?? '?'
  return name[0]?.toUpperCase() ?? '?'
}

interface CompanionAvatarStackProps {
  companions: CompanionWithUser[]
  onClick?: () => void
  maxVisible?: number
}

export default function CompanionAvatarStack({
  companions,
  onClick,
  maxVisible = 2,
}: CompanionAvatarStackProps) {
  if (companions.length === 0) return null

  const visible = companions.slice(0, maxVisible)
  const overflow = companions.length - maxVisible

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center cursor-pointer group"
      aria-label={`${companions.length} companion${companions.length === 1 ? '' : 's'}`}
    >
      {visible.map((c, i) => {
        const identifier = c.user?.email ?? c.user_id
        const color = getAvatarColor(identifier)
        const initial = getInitial(c)

        return (
          <div
            key={c.id}
            className="relative rounded-full border-2 border-white overflow-hidden group-hover:opacity-90 transition-opacity"
            style={{
              width: 28,
              height: 28,
              marginLeft: i === 0 ? 0 : -8,
              zIndex: maxVisible - i,
              flexShrink: 0,
            }}
          >
            {c.user?.avatar_url ? (
              <img
                src={c.user.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white font-semibold"
                style={{
                  backgroundColor: color,
                  fontSize: 12,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {initial}
              </div>
            )}
          </div>
        )
      })}
      {overflow > 0 && (
        <div
          className="relative rounded-full border-2 border-white flex items-center justify-center bg-bg-muted group-hover:bg-border-input transition-colors"
          style={{
            width: 28,
            height: 28,
            marginLeft: -8,
            zIndex: 0,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontWeight: 600,
              color: '#6b6860',
            }}
          >
            +{overflow}
          </span>
        </div>
      )}
    </button>
  )
}
