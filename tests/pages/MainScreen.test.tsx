import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MainScreen from '../../src/pages/MainScreen'
import ProfileScreen from '../../src/pages/ProfileScreen'
import { ROLL_HISTORY_STORAGE_LIMIT, STORAGE_WARNING_EVENT, type RollHistoryEntry, useAppStore } from '../../src/stores/useAppStore'
import FormulaScreen from '../../src/pages/FormulaScreen'

const {
  connectDieMock,
  getBleUnavailableMessageMock,
  glowDieMock,
} = vi.hoisted(() => ({
  connectDieMock: vi.fn(),
  getBleUnavailableMessageMock: vi.fn(() => 'Bluetooth is unavailable on this build. Run the app on a supported Android device.'),
  glowDieMock: vi.fn(),
}))

vi.mock('../../src/services/pixelsService', () => ({
  connectDie: connectDieMock,
  getBleUnavailableMessage: getBleUnavailableMessageMock,
  glowDie: glowDieMock,
}))

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function LocationStateDisplay() {
  const location = useLocation()
  return <div data-testid="location-state">{JSON.stringify(location.state)}</div>
}

function createHistoryEntry(overrides: Partial<RollHistoryEntry> & Pick<RollHistoryEntry, 'id' | 'total'>): RollHistoryEntry {
  return {
    formulaName: '',
    formulaString: '',
    rolledAt: Date.now(),
    ...overrides,
  }
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

function renderMainScreen() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/' }]}>
      <Routes>
        <Route path="/" element={<><MainScreen /><LocationDisplay /></>} />
        <Route path="/formula/:id" element={<LocationDisplay />} />
        <Route path="/roll/:id" element={<LocationDisplay />} />
        <Route path="/roll" element={<><FormulaScreen mode="roll-only" /><LocationDisplay /><LocationStateDisplay /></>} />
        <Route path="/formula/new" element={<LocationDisplay />} />
        <Route path="/settings" element={<LocationDisplay />} />
        <Route path="/profiles" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )
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

    expect(screen.getAllByText('Pixels Roller').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Default' })).toBeInTheDocument()
    expect(screen.getByText('No saved formulas yet — tap + to add one')).toBeInTheDocument()
    expect(screen.getByText('No rolls yet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/formula/new')
  })

  it('populates formulas and history from the active profile on startup', () => {
    useAppStore.setState({
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          isCharacter: false,
          skills: [],
          formulas: [
            {
              id: 'formula-1',
              name: 'Fireball',
              formula: '8d6',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          history: [createHistoryEntry({ id: 'history-1', formulaName: 'Fireball', total: 28 })],
          createdAt: 1,
          updatedAt: 1,
        },
      },
      activeProfileId: 'default',
      savedFormulas: [],
      rollHistory: [],
    })

    renderMainScreen()

    expect(screen.getByRole('heading', { name: 'Fireball' })).toBeInTheDocument()
    expect(screen.getByText('8d6')).toBeInTheDocument()
    expect(screen.queryByText('No rolls yet')).not.toBeInTheDocument()
    expect(screen.getByText('Fireball', { selector: 'p' })).toBeInTheDocument()
  })

  it('opens a saved formula on a quick tap', () => {
    useAppStore.setState({
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          isCharacter: false,
          skills: [],
          formulas: [
            {
              id: 'formula-1',
              name: 'Fireball',
              formula: '8d6',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          history: [],
          createdAt: 1,
          updatedAt: 1,
        },
      },
      activeProfileId: 'default',
      savedFormulas: [],
      rollHistory: [],
    })

    renderMainScreen()

    fireEvent.click(screen.getByRole('button', { name: 'Open formula Fireball' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/roll/formula-1')
  })

  it('opens the formula roll options modal after a sustained hold and launches the transformed roll', async () => {
    vi.useFakeTimers()
    useAppStore.setState({
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          isCharacter: false,
          skills: [],
          formulas: [
            {
              id: 'formula-1',
              name: 'Fireball',
              formula: '1d12+3d6+4',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          history: [],
          createdAt: 1,
          updatedAt: 1,
        },
      },
      activeProfileId: 'default',
      savedFormulas: [],
      rollHistory: [],
    })

    renderMainScreen()

    const formulaButton = screen.getByRole('button', { name: 'Open formula Fireball' })
    fireEvent.pointerDown(formulaButton, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    vi.advanceTimersByTime(1000)
    fireEvent.pointerUp(formulaButton, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Choose how to launch this saved formula.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Double All' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/roll')
    expect(screen.getByTestId('location-state')).toHaveTextContent('(1d12+3d6+4)*2')
  })

  it('reorders saved formulas when a held card is dragged past another card', async () => {
    vi.useFakeTimers()
    useAppStore.setState({
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          isCharacter: false,
          skills: [],
          formulas: [
            {
              id: 'formula-1',
              name: 'Alpha',
              formula: '1d4',
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: 'formula-2',
              name: 'Beta',
              formula: '1d6',
              createdAt: 2,
              updatedAt: 2,
            },
          ],
          history: [],
          createdAt: 1,
          updatedAt: 1,
        },
      },
      activeProfileId: 'default',
      savedFormulas: [],
      rollHistory: [],
    })

    const getBoundingClientRectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const formulaId = this.getAttribute('data-formula-card-id')

      if (formulaId === 'formula-1') {
        return { top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      }

      if (formulaId === 'formula-2') {
        return { top: 140, bottom: 240, left: 0, right: 200, width: 200, height: 100, x: 0, y: 140, toJSON: () => ({}) } as DOMRect
      }

      return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    })

    renderMainScreen()

    const formulaButton = screen.getByRole('button', { name: 'Open formula Alpha' })
    fireEvent.pointerDown(formulaButton, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    vi.advanceTimersByTime(1000)
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 220 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 10, clientY: 220 })

    expect(useAppStore.getState().profiles.default.formulas.map((formula) => formula.name)).toEqual(['Beta', 'Alpha'])

    getBoundingClientRectSpy.mockRestore()
  })

  it('navigates to the profiles screen from the header', () => {
    renderMainScreen()

    fireEvent.click(screen.getByRole('button', { name: 'Open profiles' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/profiles')
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

    useAppStore.setState({
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          isCharacter: false,
          skills: [],
          formulas: [
            {
              id: 'formula-1',
              name: 'Fireball',
              formula: '8d6',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          history: [],
          createdAt: 1,
          updatedAt: 1,
        },
      },
      activeProfileId: 'default',
      savedFormulas: [],
      rollHistory: [],
    })

    renderMainScreen()

    fireEvent.click(screen.getByLabelText('More options for Fireball'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Delete formula?')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(useAppStore.getState().profiles.default.formulas).toHaveLength(0)
    expect(screen.getByText('Formula deleted')).toBeInTheDocument()
  })

  it('renders a fixed 5-item history preview and opens a larger history list', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'))

    useAppStore.setState({
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          isCharacter: false,
          skills: [],
          formulas: [],
          history: [
            createHistoryEntry({ id: 'one', formulaName: 'Fireball', total: 28, rolledAt: Date.now() - 30_000 }),
            createHistoryEntry({ id: 'two', formulaName: '', formulaString: '2d6+3', total: 11, rolledAt: Date.now() - 60_000 }),
            createHistoryEntry({ id: 'three', formulaName: 'Sneak Attack', total: 19, rolledAt: Date.now() - 90_000 }),
            createHistoryEntry({ id: 'four', formulaName: 'Shield Bash', total: 9, rolledAt: Date.now() - 120_000 }),
            createHistoryEntry({ id: 'five', formulaName: 'Ray of Frost', total: 14, rolledAt: Date.now() - 150_000 }),
            createHistoryEntry({ id: 'six', formulaName: 'Guiding Bolt', total: 21, rolledAt: Date.now() - 180_000 }),
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      },
      rollHistory: [],
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
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          isCharacter: false,
          skills: [],
          formulas: [],
          history: [
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
                expression: '2d20kh1+5',
                raw: '2d20kh1+5',
                canonical: '2d20kh1+5',
              },
            }),
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      },
      rollHistory: [],
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

  it('shows a character sheet and rolls on tap while prompting on long-press selection', async () => {
    vi.useFakeTimers()

    useAppStore.setState({
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          isCharacter: true,
          skills: [{ id: 'skill-1', label: 'Stealth', modifier: 3 }],
          formulas: [],
          history: [],
          createdAt: 1,
          updatedAt: 1,
        },
      },
      activeProfileId: 'default',
    })

    renderMainScreen()

    expect(screen.getByText('Character Sheet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+3' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/roll')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('button', { name: '+3' }))
    vi.advanceTimersByTime(400)
    fireEvent.mouseUp(screen.getByRole('button', { name: '+3' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Stealth')
    fireEvent.click(screen.getByRole('button', { name: 'Advantage' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/roll')
  })

  it('selects formulas and launches a combined roll on tap', () => {
    useAppStore.setState({
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          isCharacter: false,
          skills: [],
          formulas: [
            {
              id: 'formula-1',
              name: 'Attack',
              formula: '1d20+3',
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: 'formula-2',
              name: 'Damage',
              formula: '4d12+1',
              createdAt: 2,
              updatedAt: 2,
            },
          ],
          history: [],
          createdAt: 1,
          updatedAt: 1,
        },
      },
      activeProfileId: 'default',
      savedFormulas: [],
      rollHistory: [],
    })

    renderMainScreen()

    expect(screen.queryByRole('button', { name: 'Roll selected formulas' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Select Attack for combined roll'))
    fireEvent.click(screen.getByLabelText('Select Damage for combined roll'))

    const rollButton = screen.getByRole('button', { name: 'Roll selected formulas' })
    expect(rollButton).toBeInTheDocument()

    fireEvent.click(rollButton)

    expect(screen.getByRole('heading', { name: 'Combined Roll' })).toBeInTheDocument()
    expect(screen.getByText('1d20+3+4d12+1')).toBeInTheDocument()
    expect(screen.getByTestId('location-state')).toHaveTextContent('"name":"Combined Roll"')
    expect(screen.getByTestId('location-state')).toHaveTextContent('"formulaText":"1d20+3+4d12+1"')
  })

  it('opens the combined-roll modal on a long press and applies a doubled formula variant', () => {
    vi.useFakeTimers()

    useAppStore.setState({
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          isCharacter: false,
          skills: [],
          formulas: [
            {
              id: 'formula-1',
              name: 'Attack',
              formula: '1d20+3',
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: 'formula-2',
              name: 'Damage',
              formula: '4d12+1',
              createdAt: 2,
              updatedAt: 2,
            },
          ],
          history: [],
          createdAt: 1,
          updatedAt: 1,
        },
      },
      activeProfileId: 'default',
      savedFormulas: [],
      rollHistory: [],
    })

    renderMainScreen()

    fireEvent.click(screen.getByLabelText('Select Attack for combined roll'))
    fireEvent.click(screen.getByLabelText('Select Damage for combined roll'))

    const rollButton = screen.getByRole('button', { name: 'Roll selected formulas' })
    fireEvent.mouseDown(rollButton)
    vi.advanceTimersByTime(999)
    expect(screen.queryByRole('dialog', { name: /Combined Roll/i })).not.toBeInTheDocument()
    vi.advanceTimersByTime(1)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Combined Roll')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Double Dice' }))

    expect(screen.getByRole('heading', { name: 'Combined Roll' })).toBeInTheDocument()
    expect(screen.getByText('2d20+8d12+4')).toBeInTheDocument()
  })

  it('clears combined selection when a selected formula is deleted', () => {
    useAppStore.setState({
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          isCharacter: false,
          skills: [],
          formulas: [
            {
              id: 'formula-1',
              name: 'Attack',
              formula: '1d20+3',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          history: [],
          createdAt: 1,
          updatedAt: 1,
        },
      },
      activeProfileId: 'default',
      savedFormulas: [],
      rollHistory: [],
    })

    renderMainScreen()

    fireEvent.click(screen.getByLabelText('Select Attack for combined roll'))
    expect(screen.getByRole('button', { name: 'Roll selected formulas' })).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('More options for Attack'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.queryByRole('button', { name: 'Roll selected formulas' })).not.toBeInTheDocument()
  })

  it('clears combined selection when the active profile changes', () => {
    useAppStore.setState({
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          isCharacter: false,
          skills: [],
          formulas: [
            {
              id: 'formula-1',
              name: 'Attack',
              formula: '1d20+3',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          history: [],
          createdAt: 1,
          updatedAt: 1,
        },
        alt: {
          id: 'alt',
          name: 'Alt',
          isCharacter: false,
          skills: [],
          formulas: [],
          history: [],
          createdAt: 2,
          updatedAt: 2,
        },
      },
      activeProfileId: 'default',
      savedFormulas: [],
      rollHistory: [],
    })

    renderMainScreen()

    fireEvent.click(screen.getByLabelText('Select Attack for combined roll'))
    expect(screen.getByRole('button', { name: 'Roll selected formulas' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open profiles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    expect(screen.queryByRole('button', { name: 'Roll selected formulas' })).not.toBeInTheDocument()
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
