import { useState } from 'react'
import GlobalFABs from './GlobalFABs'
import GlobalSearchOverlay from './GlobalSearchOverlay'
import GlobalCreateSheet from './GlobalCreateSheet'

export default function GlobalActions() {
  const [showCreate, setShowCreate] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  return (
    <>
      {/* Hide FABs when either overlay/sheet is open */}
      {!showCreate && !showSearch && (
        <GlobalFABs
          onCreateClick={() => setShowCreate(true)}
          onSearchClick={() => setShowSearch(true)}
        />
      )}

      {showSearch && (
        <GlobalSearchOverlay onClose={() => setShowSearch(false)} />
      )}

      {showCreate && (
        <GlobalCreateSheet onClose={() => setShowCreate(false)} />
      )}
    </>
  )
}
