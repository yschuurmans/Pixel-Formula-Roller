import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MainScreen from '../MainScreen'
import { ROLL_HISTORY_STORAGE_LIMIT, STORAGE_WARNING_EVENT, type RollHistoryEntry, useAppStore } from '../../stores/useAppStore'

const {
  connectDieMock,
  getBleUnavailableMessageMock,
  glowDieMock,
} = vi.hoisted(() => ({
  connectDieMock: vi.fn(),
  getBleUnavailableMessageMock: vi.fn(() => 'Bluetooth is unavailable on this build. Run the app on a supported Android device.'),
  glowDieMock: vi.fn(),
}))

vi.mock('../../services/pixelsService', () => ({
  connectDie: connectDieMock,
  getBleUnavailableMessage: getBleUnavailableMessageMock,
  glowDie: glowDieMock,
}))

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
        <Route path="/roll/:id" element={<LocationDisplay />} />
        <Route path="/formula/new" element={<LocationDisplay />} />
        <Route path="/settings" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )
}

function createHistoryEntry(overrides: Partial<ReturnType<typeof baseHistoryEntry>> = {}) {
  return { ...baseHistoryEntry(), ...overrides }
}

function baseHistoryEntry(): RollHistoryEntry {
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
    settings: { theme: 'dark', highlightLowBattery: false },
    pairedPixelIds: [],
    bleAvailable: true,
    bleError: null,
    pixels: {},
  })
}

describe('MainScreen', () => {
  beforeEach(() => {
    resetStore()
    connectDieMock.mockReset()
    getBleUnavailableMessageMock.mockClear()
    glowDieMock.mockReset()
    vi.useRealTimers()
  })

  it('shows empty states and navigation actions', () => {
    renderMainScreen()

    expect(screen.getByText('No saved formulas yet — tap + to add one')).toBeInTheDocument()
    expect(screen.getByText('No rolls yet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/formula/new')
  })

  it('runs quick connect from the header button and shows a spinner while pending', async () => {
    let resolveConnect: (() => void) | undefined
    connectDieMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveConnect = resolve
        }),
    )

    renderMainScreen()

    fireEvent.click(screen.getByRole('button', { name: 'Connect new die' }))

    expect(connectDieMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Connecting dice' })).toBeDisabled()

    await act(async () => {
      resolveConnect?.()
    })

    expect(screen.getByRole('button', { name: 'Connect new die' })).toBeEnabled()
  })

  it('flashes all connected dice when the quick connect button is held', async () => {
    vi.useFakeTimers()
    useAppStore.setState({
      pixels: {
        'pixel-1234': {
          pixelId: 'pixel-1234',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 82,
          lastFace: 17,
        },
        'pixel-4321': {
          pixelId: 'pixel-4321',
          dieType: 'd6',
          connectionState: 'connected',
          batteryLevel: 64,
          lastFace: 3,
        },
      },
    })

    renderMainScreen()

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Connect new die' }))
    vi.advanceTimersByTime(500)
    fireEvent.mouseUp(screen.getByRole('button', { name: 'Connect new die' }))

    await act(async () => undefined)

    expect(glowDieMock).toHaveBeenCalledTimes(2)
    expect(glowDieMock).toHaveBeenCalledWith('pixel-1234')
    expect(glowDieMock).toHaveBeenCalledWith('pixel-4321')
    expect(connectDieMock).not.toHaveBeenCalled()
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
    expect(screen.getByTestId('location')).toHaveTextContent('/roll/formula-1')
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

  it('renders a fixed 5-item history preview and opens a larger history list', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'))

    useAppStore.setState({
      rollHistory: [
        createHistoryEntry({ id: 'one', formulaName: 'Fireball', total: 28, rolledAt: Date.now() - 30_000 }),
        createHistoryEntry({ id: 'two', formulaName: '', formulaString: '2d6+3', total: 11, rolledAt: Date.now() - 60_000 }),
        createHistoryEntry({ id: 'three', formulaName: 'Sneak Attack', total: 19, rolledAt: Date.now() - 90_000 }),
        createHistoryEntry({ id: 'four', formulaName: 'Shield Bash', total: 9, rolledAt: Date.now() - 120_000 }),
        createHistoryEntry({ id: 'five', formulaName: 'Ray of Frost', total: 14, rolledAt: Date.now() - 150_000 }),
        createHistoryEntry({ id: 'six', formulaName: 'Guiding Bolt', total: 21, rolledAt: Date.now() - 180_000 }),
      ],
    })

    renderMainScreen()

    expect(screen.getByText('Fireball')).toBeInTheDocument()
    expect(screen.getByText('2d6+3')).toBeInTheDocument()
    expect(screen.getByText('Sneak Attack')).toBeInTheDocument()
    expect(screen.getByText('Shield Bash')).toBeInTheDocument()
    expect(screen.getByText('Ray of Frost')).toBeInTheDocument()
    expect(screen.queryByText('Guiding Bolt')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'See more' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(`Last ${ROLL_HISTORY_STORAGE_LIMIT} rolls`)).toBeInTheDocument()
    expect(within(dialog).getByText('Guiding Bolt')).toBeInTheDocument()
  })

  it('opens an expanded history dialog with formula and die results', () => {
    useAppStore.setState({
      rollHistory: [
        createHistoryEntry({
          id: 'detail-entry',
          formulaName: 'Advantage Attack',
          formulaString: '2d20kh1+5',
          total: 23,
          result: {
            groups: [
              {
                dieType: 'd20',
                rolls: [
                  { dieType: 'd20', face: 18, kept: true, source: 'ble' },
                  { dieType: 'd20', face: 7, kept: false, source: 'ble' },
                ],
              },
            ],
            flatModifier: 5,
            total: 23,
          },
          parsedFormula: {
            groups: [{ dieType: 'd20', count: 2, keep: { mode: 'kh', n: 1 } }],
            flatModifier: 5,
            raw: '2d20kh1+5',
            canonical: '2d20kh1+5',
          },
        }),
      ],
    })

    renderMainScreen()

    fireEvent.click(screen.getByRole('button', { name: /Advantage Attack/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Roll Details')).toBeInTheDocument()
    expect(within(dialog).getByText('2d20kh1+5')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('d20 #1 result 18')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('d20 #2 result 7 dropped')).toBeInTheDocument()
    expect(within(dialog).getByText('Flat modifier: +5')).toBeInTheDocument()
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

  it('shows a toast passed through navigation state', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/', state: { toastMessage: 'Formula saved' } }]}>
        <Routes>
          <Route path="/" element={<><MainScreen /><LocationDisplay /></>} />
          <Route path="/formula/:id" element={<LocationDisplay />} />
          <Route path="/roll/:id" element={<LocationDisplay />} />
          <Route path="/formula/new" element={<LocationDisplay />} />
          <Route path="/settings" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Formula saved')).toBeInTheDocument()
  })
})
