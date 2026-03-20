import { NavLink, useLocation } from 'react-router-dom'

const navItems = [
  {
    to: '/inbox',
    label: 'Horizon',
    /** Also highlight for /item/* routes (item detail is a Horizon sub-page) */
    matchPaths: ['/inbox', '/item/'],
    icon: (active: boolean) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-7 h-7 transition-transform ${active ? 'scale-110' : ''}`}>
        <path d="M3 13h1" />
        <path d="M20 13h1" />
        <path d="M5.6 6.6l.7 .7" />
        <path d="M18.4 6.6l-.7 .7" />
        <path d="M8 13a4 4 0 1 1 8 0" />
        <path d="M3 17h18" />
        <path d="M7 20h5" />
        <path d="M16 20h1" />
        <path d="M12 5v-1" />
      </svg>
    ),
  },
  {
    to: '/trips',
    label: 'Trips',
    /** Also highlight for /trip/* routes (trip detail, destination, route pages) */
    matchPaths: ['/trips', '/trip/'],
    icon: (active: boolean) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-6 h-6 transition-transform ${active ? 'scale-110' : ''}`}>
        <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 019.75 22.5a.75.75 0 01-.75-.75v-4.131A15.838 15.838 0 016.382 15H2.25a.75.75 0 01-.75-.75 6.75 6.75 0 017.815-6.666zM15 6.75a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" clipRule="evenodd" />
        <path d="M5.26 17.242a.75.75 0 10-.897-1.203 5.243 5.243 0 00-2.05 5.022.75.75 0 00.625.627 5.243 5.243 0 005.022-2.051.75.75 0 10-1.202-.897 3.744 3.744 0 01-3.008 1.51c0-1.23.592-2.323 1.51-3.008z" />
      </svg>
    ),
  },
  {
    to: '/search',
    label: 'Search',
    matchPaths: ['/search'],
    icon: (active: boolean) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-6 h-6 transition-transform ${active ? 'scale-110' : ''}`}>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    matchPaths: ['/profile'],
    icon: (active: boolean) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-6 h-6 transition-transform ${active ? 'scale-110' : ''}`}>
        <circle cx="12" cy="8" r="5" />
        <path d="M20 21a8 8 0 0 0-16 0" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const location = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          // Custom active check: match any of the item's matchPaths as prefixes
          const isActive = item.matchPaths.some((p) => location.pathname.startsWith(p))

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={
                `flex flex-col items-center gap-0.5 px-5 py-2 rounded-2xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'text-accent bg-accent-light'
                    : 'text-text-faint hover:text-text-tertiary hover:bg-bg-muted'
                }`
              }
            >
              {item.icon(isActive)}
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
