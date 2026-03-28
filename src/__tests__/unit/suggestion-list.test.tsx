import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SuggestionList from '../../components/map/SuggestionList'
import type { SuggestionGroup } from '../../lib/groupSavesByGeography'

function makeGroup(overrides: Partial<SuggestionGroup> & { id: string; label: string }): SuggestionGroup {
  return { saveCount: 3, saves: [], countryCode: 'JP', ...overrides }
}

const groups: SuggestionGroup[] = [
  makeGroup({ id: 'country-JP', label: 'Japan', saveCount: 8, countryCode: 'JP' }),
  makeGroup({ id: 'country-TW', label: 'Taiwan', saveCount: 6, countryCode: 'TW' }),
  makeGroup({ id: 'country-CN', label: 'China', saveCount: 5, countryCode: 'CN' }),
  makeGroup({ id: 'country-US', label: 'United States', saveCount: 3, countryCode: 'US' }),
  makeGroup({ id: 'country-MN', label: 'Mongolia', saveCount: 1, countryCode: 'MN' }),
  makeGroup({ id: 'country-FR', label: 'France', saveCount: 2, countryCode: 'FR' }),
  makeGroup({ id: 'country-TH', label: 'Thailand', saveCount: 1, countryCode: 'TH' }),
]

const defaultProps = {
  granularity: 'country' as const,
  onGranularityChange: vi.fn(),
  onAddDestination: vi.fn(),
  onAddAll: vi.fn(),
  unassignedCount: 0,
}

describe('SuggestionList', () => {
  it('renders correct number of visible suggestion rows (max 5)', () => {
    render(<SuggestionList groups={groups} {...defaultProps} />)
    expect(screen.getByTestId('suggestion-row-country-JP')).toBeInTheDocument()
    expect(screen.getByTestId('suggestion-row-country-MN')).toBeInTheDocument()
    expect(screen.queryByTestId('suggestion-row-country-FR')).not.toBeInTheDocument()
  })

  it('each row shows name and save count', () => {
    render(<SuggestionList groups={groups.slice(0, 2)} {...defaultProps} />)
    expect(screen.getByText('Japan')).toBeInTheDocument()
    expect(screen.getByText(/8 saves/)).toBeInTheDocument()
  })

  it('[+] shows confirmation with two buttons for city-level groups with saves', () => {
    const cityGroups = [makeGroup({ id: 'city-Tokyo', label: 'Tokyo', saveCount: 5, countryCode: 'JP' })]
    render(<SuggestionList groups={cityGroups} {...defaultProps} granularity="city" />)
    fireEvent.click(screen.getByTestId('suggestion-add-city-Tokyo'))
    expect(screen.getByTestId('suggestion-confirm-city-Tokyo')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-add-dest-city-Tokyo')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-add-all-city-Tokyo')).toBeInTheDocument()
  })

  it('"Add destination" calls onAddDestination', () => {
    const onAddDest = vi.fn()
    const cityGroups = [makeGroup({ id: 'city-Tokyo', label: 'Tokyo', saveCount: 5, countryCode: 'JP' })]
    render(<SuggestionList groups={cityGroups} {...defaultProps} granularity="city" onAddDestination={onAddDest} />)
    fireEvent.click(screen.getByTestId('suggestion-add-city-Tokyo'))
    fireEvent.click(screen.getByTestId('confirm-add-dest-city-Tokyo'))
    expect(onAddDest).toHaveBeenCalledWith(cityGroups[0])
  })

  it('"Add all X" calls onAddAll', () => {
    const onAddAll = vi.fn()
    const cityGroups = [makeGroup({ id: 'city-Tokyo', label: 'Tokyo', saveCount: 5, countryCode: 'JP' })]
    render(<SuggestionList groups={cityGroups} {...defaultProps} granularity="city" onAddAll={onAddAll} />)
    fireEvent.click(screen.getByTestId('suggestion-add-city-Tokyo'))
    fireEvent.click(screen.getByTestId('confirm-add-all-city-Tokyo'))
    expect(onAddAll).toHaveBeenCalledWith(cityGroups[0])
  })

  it('confirmation dismisses after action', () => {
    const cityGroups = [makeGroup({ id: 'city-Tokyo', label: 'Tokyo', saveCount: 5, countryCode: 'JP' })]
    render(<SuggestionList groups={cityGroups} {...defaultProps} granularity="city" />)
    fireEvent.click(screen.getByTestId('suggestion-add-city-Tokyo'))
    expect(screen.getByTestId('suggestion-confirm-city-Tokyo')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('confirm-add-dest-city-Tokyo'))
    expect(screen.queryByTestId('suggestion-confirm-city-Tokyo')).not.toBeInTheDocument()
  })

  it('expandable section shows when more than 5 groups', () => {
    render(<SuggestionList groups={groups} {...defaultProps} />)
    const expandBtn = screen.getByTestId('suggestion-expand')
    expect(expandBtn.textContent).toContain('2')
  })

  it('tapping expandable shows hidden items', () => {
    render(<SuggestionList groups={groups} {...defaultProps} />)
    expect(screen.queryByTestId('suggestion-row-country-FR')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('suggestion-expand'))
    expect(screen.getByTestId('suggestion-row-country-FR')).toBeInTheDocument()
  })

  it('unassigned count shows when > 0', () => {
    render(<SuggestionList groups={[]} {...defaultProps} unassignedCount={3} />)
    expect(screen.getByTestId('unassigned-saves')).toBeInTheDocument()
    expect(screen.getByText(/3 saves have no location/)).toBeInTheDocument()
  })

  it('unassigned section hidden when count is 0', () => {
    render(<SuggestionList groups={[]} {...defaultProps} unassignedCount={0} />)
    expect(screen.queryByTestId('unassigned-saves')).not.toBeInTheDocument()
  })
})
