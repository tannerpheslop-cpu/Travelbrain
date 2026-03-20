import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BottomNav from '../BottomNav'

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  )
}

function getNavItem(label: string) {
  return screen.getByText(label).closest('a')!
}

function isActive(el: HTMLElement): boolean {
  return el.className.includes('text-accent')
}

describe('BottomNav', () => {
  it('renders all four navigation items', () => {
    renderAtRoute('/inbox')
    expect(screen.getByText('Horizon')).toBeInTheDocument()
    expect(screen.getByText('Trips')).toBeInTheDocument()
    expect(screen.getByText('Search')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
  })

  it('highlights Horizon tab on /inbox', () => {
    renderAtRoute('/inbox')
    expect(isActive(getNavItem('Horizon'))).toBe(true)
    expect(isActive(getNavItem('Trips'))).toBe(false)
  })

  it('highlights Horizon tab on /item/:id (item detail sub-page)', () => {
    renderAtRoute('/item/abc-123')
    expect(isActive(getNavItem('Horizon'))).toBe(true)
    expect(isActive(getNavItem('Trips'))).toBe(false)
  })

  it('highlights Trips tab on /trips', () => {
    renderAtRoute('/trips')
    expect(isActive(getNavItem('Trips'))).toBe(true)
    expect(isActive(getNavItem('Horizon'))).toBe(false)
  })

  it('highlights Trips tab on /trip/:id (trip detail)', () => {
    renderAtRoute('/trip/trip-123')
    expect(isActive(getNavItem('Trips'))).toBe(true)
    expect(isActive(getNavItem('Horizon'))).toBe(false)
  })

  it('highlights Trips tab on /trip/:id/dest/:destId (destination detail)', () => {
    renderAtRoute('/trip/trip-123/dest/dest-456')
    expect(isActive(getNavItem('Trips'))).toBe(true)
    expect(isActive(getNavItem('Horizon'))).toBe(false)
  })

  it('highlights Trips tab on /trip/:id/route/:routeId', () => {
    renderAtRoute('/trip/trip-123/route/route-789')
    expect(isActive(getNavItem('Trips'))).toBe(true)
  })

  it('highlights Search tab on /search', () => {
    renderAtRoute('/search')
    expect(isActive(getNavItem('Search'))).toBe(true)
    expect(isActive(getNavItem('Horizon'))).toBe(false)
    expect(isActive(getNavItem('Trips'))).toBe(false)
  })

  it('highlights Profile tab on /profile', () => {
    renderAtRoute('/profile')
    expect(isActive(getNavItem('Profile'))).toBe(true)
    expect(isActive(getNavItem('Horizon'))).toBe(false)
  })

  it('no tab is highlighted on an unknown route', () => {
    renderAtRoute('/unknown-page')
    expect(isActive(getNavItem('Horizon'))).toBe(false)
    expect(isActive(getNavItem('Trips'))).toBe(false)
    expect(isActive(getNavItem('Search'))).toBe(false)
    expect(isActive(getNavItem('Profile'))).toBe(false)
  })

  it('nav items link to correct routes', () => {
    renderAtRoute('/inbox')
    expect(getNavItem('Horizon')).toHaveAttribute('href', '/inbox')
    expect(getNavItem('Trips')).toHaveAttribute('href', '/trips')
    expect(getNavItem('Search')).toHaveAttribute('href', '/search')
    expect(getNavItem('Profile')).toHaveAttribute('href', '/profile')
  })
})
