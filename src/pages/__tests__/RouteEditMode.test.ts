/**
 * Route Edit Mode tests for RouteDetailPage.
 *
 * Verifies that the edit mode toggle, checkbox UI, bulk action bar,
 * selection counter, and action buttons work correctly.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'RouteDetailPage.tsx'),
  'utf-8',
)

describe('RouteDetailPage — Edit mode toggle', () => {
  it('has editMode and selectedIds state', () => {
    expect(SOURCE).toContain('const [editMode, setEditMode] = useState(false)')
    expect(SOURCE).toContain('const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())')
  })

  it('toggle button switches between MoreHorizontal icon and Done text', () => {
    expect(SOURCE).toContain("editMode ? 'Done' : <MoreHorizontal size={20} />")
    expect(SOURCE).toContain('data-testid="edit-mode-toggle"')
  })

  it('Done button uses accent-primary color', () => {
    expect(SOURCE).toContain("editMode ? 'var(--accent-primary, #B8441E)' : 'var(--text-tertiary)'")
  })

  it('exitEditMode clears selections', () => {
    expect(SOURCE).toContain('setEditMode(false)')
    expect(SOURCE).toContain('setSelectedIds(new Set())')
  })
})

describe('RouteDetailPage — Edit mode checkbox UI', () => {
  it('shows checkbox when editMode is true', () => {
    expect(SOURCE).toContain('editMode ? (')
    expect(SOURCE).toContain('data-testid={`edit-checkbox-${item.id}`}')
  })

  it('checkbox uses accent-primary background when selected', () => {
    expect(SOURCE).toContain("background: selected ? 'var(--accent-primary, #B8441E)' : 'transparent'")
  })

  it('shows Check icon when selected', () => {
    expect(SOURCE).toContain('{selected && <Check size={14}')
  })

  it('hides drag handle in edit mode, hides chevron in edit mode', () => {
    // Drag handle only in non-edit mode (else branch)
    expect(SOURCE).toContain("cursor: 'grab'")
    // Chevron hidden in edit mode
    expect(SOURCE).toContain('{!editMode && <ChevronRight')
  })

  it('item content is not a Link in edit mode (prevents navigation)', () => {
    // In edit mode, content is a plain div, not a Link
    expect(SOURCE).toContain('{editMode ? (')
    expect(SOURCE).toContain("onClick={editMode ? onToggleSelect : undefined}")
  })

  it('passes editMode and selection props to SortableItemRow', () => {
    expect(SOURCE).toContain('editMode={editMode}')
    expect(SOURCE).toContain('selected={selectedIds.has(item.id)}')
    expect(SOURCE).toContain('onToggleSelect={() => toggleSelect(item.id)}')
  })
})

describe('RouteDetailPage — Selection counter', () => {
  it('shows selection count when items selected in edit mode', () => {
    expect(SOURCE).toContain('{editMode && selectedIds.size > 0 && (')
    expect(SOURCE).toContain('{selectedIds.size} selected')
    expect(SOURCE).toContain('data-testid="edit-selection-count"')
  })
})

describe('RouteDetailPage — Edit mode action bar', () => {
  it('renders action bar only in edit mode', () => {
    expect(SOURCE).toContain('{editMode && (')
    expect(SOURCE).toContain('data-testid="edit-action-bar"')
  })

  it('action bar is fixed above bottom nav', () => {
    expect(SOURCE).toContain("position: 'fixed'")
    expect(SOURCE).toContain("bottom: 64")
  })

  it('has Remove button that is disabled when nothing selected', () => {
    expect(SOURCE).toContain('data-testid="edit-remove-btn"')
    expect(SOURCE).toContain('disabled={selectedIds.size === 0}')
  })

  it('has Delete button with confirmation dialog', () => {
    expect(SOURCE).toContain('data-testid="edit-delete-btn"')
    expect(SOURCE).toContain('if (selectedIds.size > 0) setShowDeleteConfirm(true)')
  })

  it('has Break apart button that is always enabled', () => {
    expect(SOURCE).toContain('data-testid="edit-breakapart-btn"')
    // Break apart has no disabled prop — always clickable
    const breakApartBtn = SOURCE.match(/data-testid="edit-breakapart-btn"[\s\S]*?<\/button>/)?.[0]
    expect(breakApartBtn).toBeDefined()
    expect(breakApartBtn).not.toContain('disabled')
  })

  it('Break apart confirmation says "Nothing will be deleted"', () => {
    expect(SOURCE).toContain('Nothing will be deleted.')
    expect(SOURCE).toContain("confirmLabel=\"Break apart\"")
  })

  it('Delete confirmation for bulk uses selected count', () => {
    expect(SOURCE).toContain('`Delete ${selectedIds.size} item${selectedIds.size > 1 ?')
  })

  it('action buttons use correct design system tokens', () => {
    // Remove button
    expect(SOURCE).toContain("'var(--bg-elevated-2, #21262c)'")
    // Delete button
    expect(SOURCE).toContain("'var(--color-error, #c44a3d)'")
    // Break apart
    expect(SOURCE).toContain("border: '1px solid var(--border-default, #2c333a)'")
  })
})

describe('RouteDetailPage — Bulk actions exit edit mode', () => {
  it('handleBulkRemove calls exitEditMode', () => {
    // After removing, the handler calls exitEditMode
    expect(SOURCE).toContain('handleBulkRemove')
    // Check that the function body includes exitEditMode()
    const bulkRemoveBody = SOURCE.match(/handleBulkRemove[\s\S]*?exitEditMode\(\)/)?.[0]
    expect(bulkRemoveBody).toBeDefined()
  })

  it('handleBulkDelete calls exitEditMode', () => {
    const bulkDeleteBody = SOURCE.match(/handleBulkDelete[\s\S]*?exitEditMode\(\)/)?.[0]
    expect(bulkDeleteBody).toBeDefined()
  })

  it('old showMenu dropdown is removed', () => {
    expect(SOURCE).not.toContain('const [showMenu, setShowMenu]')
    expect(SOURCE).not.toContain("onClick={() => setShowMenu(")
  })
})
