import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfileScreen from '../../src/pages/ProfileScreen'
import { useAppStore } from '../../src/stores/useAppStore'

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderProfileScreen() {
  return render(
    <MemoryRouter initialEntries={['/profiles']}>
      <Routes>
        <Route path="/profiles" element={<><ProfileScreen /><LocationDisplay /></>} />
        <Route path="/" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )
}

function resetStore() {
  localStorage.clear()
  useAppStore.setState({
    profiles: {
      default: {
        id: 'default',
        name: 'Default',
        formulas: [],
        history: [],
        createdAt: 1,
        updatedAt: 1,
      },
    },
    activeProfileId: 'default',
    savedFormulas: [],
    rollHistory: [],
    settings: { theme: 'dark', highlightLowBattery: false },
    pairedPixelIds: [],
    pairedPixels: {},
    bleAvailable: true,
    bleError: null,
    pixels: {},
  })
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    resetStore()
    vi.useRealTimers()
  })

  it('creates, renames, and deletes profiles', () => {
    renderProfileScreen()

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Campaign A' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(screen.getByText('Active profile: Campaign A')).toBeInTheDocument()
    expect(useAppStore.getState().activeProfileId).not.toBe('default')

    const activeCard = screen.getByText('Campaign A').closest('article')!
    fireEvent.click(within(activeCard).getByRole('button', { name: 'Rename' }))

    fireEvent.change(screen.getByDisplayValue('Campaign A'), {
      target: { value: 'Campaign B' },
    })
    fireEvent.click(within(activeCard).getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Campaign B')).toBeInTheDocument()

    fireEvent.click(within(activeCard).getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(useAppStore.getState().activeProfileId).toBe('default')
    expect(screen.getByText('Active profile: Default')).toBeInTheDocument()
  })
})