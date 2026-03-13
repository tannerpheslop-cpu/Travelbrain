import { useState } from 'react'
import GlobalFABs from './GlobalFABs'
import CreatePopover from './CreatePopover'

export default function GlobalActions() {
  const [showCreate, setShowCreate] = useState(false)

  return (
    <>
      {/* Hide FAB when popover is open */}
      {!showCreate && (
        <GlobalFABs onCreateClick={() => setShowCreate(true)} />
      )}

      {showCreate && (
        <CreatePopover onClose={() => setShowCreate(false)} />
      )}
    </>
  )
}
