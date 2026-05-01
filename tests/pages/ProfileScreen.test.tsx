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
        <Route path="/profiles/:id/edit" element={<LocationDisplay />} />
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
        isCharacter: false,
        skills: [],
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

  it('creates and deletes profiles', () => {
    renderProfileScreen()

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Campaign A' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(screen.getByText('Active profile: Campaign A')).toBeInTheDocument()
    expect(useAppStore.getState().activeProfileId).not.toBe('default')

    const activeCard = screen.getByText('Campaign A').closest('article')!
    fireEvent.click(within(activeCard).getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(useAppStore.getState().activeProfileId).toBe('default')
    expect(screen.getByText('Active profile: Default')).toBeInTheDocument()
  })

  it('navigates to the dedicated edit screen', () => {
    renderProfileScreen()

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Character A' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    const activeCard = screen.getByText('Character A').closest('article')!
    fireEvent.click(within(activeCard).getByRole('button', { name: 'Edit' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/profiles/')
    expect(screen.getByTestId('location')).toHaveTextContent('/edit')
  })
})