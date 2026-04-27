import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MainScreen from '../MainScreen'
import { STORAGE_WARNING_EVENT, useAppStore } from '../../stores/useAppStore'

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderMainScreen() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<><MainScreen /><LocationDisplay /></>} />
        <Route path="/formula/:id" element={<LocationDisplay />} />
        <Route path="/formula/new" element={<LocationDisplay />} />
        <Route path="/settings" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )
}

function createHistoryEntry(overrides: Partial<ReturnType<typeof baseHistoryEntry>> = {}) {
  return { ...baseHistoryEntry(), ...overrides }
}

function baseHistoryEntry() {
  return {
    id: 'history-1',
    formulaName: 'Attack',
    formulaString: '1d20+5',
    total: 17,
    rolledAt: Date.now() - 60_000,
    result: {
      groups: [],
      flatModifier: 5,
      total: 17,
    },
    parsedFormula: {
      groups: [{ dieType: 'd20' as const, count: 1 }],
      flatModifier: 5,
      raw: '1d20+5',
      canonical: '1d20+5',
    },
  }
}

function resetStore() {
  localStorage.clear()
  useAppStore.setState({
    savedFormulas: [],
    rollHistory: [],
    settings: { historyLength: 5, theme: 'dark' },
    pairedPixelIds: [],
    bleAvailable: true,
    bleError: null,
    pixels: {},
  })
}

describe('MainScreen', () => {
  beforeEach(() => {
    resetStore()
    vi.useRealTimers()
  })

  it('shows empty states and navigation actions', () => {
    renderMainScreen()

    expect(screen.getByText('No saved formulas yet — tap + to add one')).toBeInTheDocument()
    expect(screen.getByText('No rolls yet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/formula/new')
  })

  it('shows the BLE unavailable banner with platform guidance', () => {
    useAppStore.setState({ bleAvailable: false })

    renderMainScreen()

    expect(screen.getByText('Bluetooth is unavailable on this build. Run the app on a supported Android device.')).toBeInTheDocument()
  })

  it('renders saved formulas and navigates when a card body is clicked', () => {
    useAppStore.setState({
      savedFormulas: [
        {
          id: 'formula-1',
          name: 'Fireball',
          formula: '8d6',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    renderMainScreen()

    fireEvent.click(screen.getByText('8d6').closest('button')!)
    expect(screen.getByTestId('location')).toHaveTextContent('/formula/formula-1')
  })

  it('opens the delete modal, removes the formula, and shows a toast', () => {
    useAppStore.setState({
      savedFormulas: [
        {
          id: 'formula-1',
          name: 'Fireball',
          formula: '8d6',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    renderMainScreen()

    fireEvent.click(screen.getByLabelText('More options for Fireball'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Delete formula?')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(useAppStore.getState().savedFormulas).toHaveLength(0)
    expect(screen.getByText('Formula deleted')).toBeInTheDocument()
  })

  it('renders recent roll history using the configured history length', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'))

    useAppStore.setState({
      settings: { historyLength: 2, theme: 'dark' },
      rollHistory: [
        createHistoryEntry({ id: 'one', formulaName: 'Fireball', total: 28, rolledAt: Date.now() - 30_000 }),
        createHistoryEntry({ id: 'two', formulaName: '', formulaString: '2d6+3', total: 11, rolledAt: Date.now() - 60_000 }),
        createHistoryEntry({ id: 'three', formulaName: 'Sneak Attack', total: 19, rolledAt: Date.now() - 90_000 }),
      ],
    })

    renderMainScreen()

    expect(screen.getByText('Fireball')).toBeInTheDocument()
    expect(screen.getByText('2d6+3')).toBeInTheDocument()
    expect(screen.queryByText('Sneak Attack')).not.toBeInTheDocument()
    expect(screen.getAllByText('1 minute ago')).toHaveLength(2)
  })

  it('shows toast messages for BLE errors and storage warnings', () => {
    useAppStore.setState({ bleError: "Bluetooth permission denied. Tap 'Connect' to try again." })

    renderMainScreen()

    expect(screen.getByText("Bluetooth permission denied. Tap 'Connect' to try again.")).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(
        new CustomEvent(STORAGE_WARNING_EVENT, {
          detail: { message: 'Storage full — oldest history entries will be removed' },
        }),
      )
    })

    expect(screen.getByText('Storage full — oldest history entries will be removed')).toBeInTheDocument()
  })
})
