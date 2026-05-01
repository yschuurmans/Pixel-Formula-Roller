import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FormulaScreen from '../../src/pages/FormulaScreen'
import MainScreen from '../../src/pages/MainScreen'
import { useAppStore } from '../../src/stores/useAppStore'

const {
  mockConnectRememberedDice,
  mockDisconnectDice,
  mockConnectRememberedDie,
  mockDisconnectDie,
  mockGlowDie,
  mockMarkPixelUsed,
  mockOnRollResult,
  mockStopAllGlows,
} = vi.hoisted(() => ({
  mockConnectRememberedDice: vi.fn(() => Promise.resolve([true])),
  mockDisconnectDice: vi.fn(() => Promise.resolve()),
  mockConnectRememberedDie: vi.fn(() => Promise.resolve(true)),
  mockDisconnectDie: vi.fn(() => Promise.resolve()),
  mockGlowDie: vi.fn(() => Promise.resolve()),
  mockMarkPixelUsed: vi.fn(),
  mockOnRollResult: vi.fn(),
  mockStopAllGlows: vi.fn(() => Promise.resolve()),
}))

let rollCallback:
  | ((pixelId: string, face: number, dieType: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100') => void)
  | undefined
const scrollIntoViewMock = vi.fn()

vi.mock('../../src/services/pixelsService', () => ({
  connectRememberedDice: mockConnectRememberedDice,
  connectRememberedDie: (mockConnectRememberedDie as unknown) as typeof mockConnectRememberedDice,
  disconnectDice: mockDisconnectDice,
  disconnectDie: (mockDisconnectDie as unknown) as typeof mockDisconnectDice,
  glowDie: mockGlowDie,
  markPixelUsed: mockMarkPixelUsed,
  onRollResult: mockOnRollResult.mockImplementation((callback: typeof rollCallback) => {
    rollCallback = callback
    return vi.fn()
  }),
  stopAllGlows: mockStopAllGlows,
}))

const { mockBlocker } = vi.hoisted(() => ({
  mockBlocker: {
    state: 'unblocked' as 'unblocked' | 'blocked' | 'proceeding',
    proceed: vi.fn(),
    reset: vi.fn(),
  },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="redirect-intent">{to}</div>,
    useBlocker: vi.fn(() => mockBlocker),
  }
})

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function TestLayout() {
  return (
    <>
      <Outlet />
      <LocationDisplay />
    </>
  )
}

function renderFormulaScreen(
  initialEntries: Array<string | { pathname: string; state?: unknown }>,
  initialIndex = initialEntries.length - 1,
) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <TestLayout />,
        children: [
          {
            index: true,
            element: <MainScreen />,
          },
          {
            path: 'formula/new',
            element: <FormulaScreen />,
          },
          {
            path: 'formula/:id',
            element: <FormulaScreen />,
          },
          {
            path: 'roll/:id',
            element: <FormulaScreen mode="roll-only" />,
          },
        ],
      },
    ],
    {
      initialEntries,
      initialIndex,
    },
  )

  return {
    router,
    ...render(
    <RouterProvider router={router} />,
    ),
  }
}

function resetStore() {
  localStorage.clear()
  useAppStore.setState({
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

describe('FormulaScreen', () => {
  beforeEach(() => {
    resetStore()
    vi.useRealTimers()
    mockBlocker.state = 'unblocked'
    mockBlocker.proceed.mockReset()
    mockBlocker.reset.mockReset()
    mockConnectRememberedDice.mockClear()
    mockDisconnectDice.mockClear()
    mockConnectRememberedDie.mockClear()
    mockDisconnectDie.mockClear()
    mockGlowDie.mockClear()
    mockMarkPixelUsed.mockClear()
    mockOnRollResult.mockClear()
    mockStopAllGlows.mockClear()
    rollCallback = undefined
    scrollIntoViewMock.mockReset()
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
      writable: true,
    })
  })

  it('renders a blank form on /formula/new', () => {
    renderFormulaScreen(['/formula/new'])

    expect(screen.getByPlaceholderText('Formula name')).toHaveValue('')
    expect(screen.getByLabelText('Formula')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('loads an existing formula, deletes it, and returns to main with a toast', async () => {
    useAppStore.setState({
      savedFormulas: [
        {
          id: 'formula-1',
          name: 'Attack Roll',
          formula: '2d20kh1+5',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    renderFormulaScreen(['/', '/formula/formula-1'])

    expect(screen.getByPlaceholderText('Formula name')).toHaveValue('Attack Roll')
    expect(screen.getByLabelText('Formula')).toHaveValue('2d20kh1+5')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Delete formula?')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(useAppStore.getState().savedFormulas).toHaveLength(0)
    expect(screen.getByTestId('redirect-intent')).toHaveTextContent('/')
  })

  it('redirects missing formulas back to main with a toast', async () => {
    renderFormulaScreen(['/', '/formula/missing'])

    expect(await screen.findByTestId('redirect-intent')).toHaveTextContent('/')
  })

  it('updates the text field from picker changes and disables actions on keep overflow', () => {
    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))

    expect(screen.getByLabelText('Formula')).toHaveValue('2d20')

    fireEvent.change(screen.getByLabelText('Keep count for d20'), {
      target: { value: '3' },
    })

    expect(screen.getByLabelText('Formula')).toHaveValue('2d20kh3')
    expect(screen.getByText('Cannot keep 3 of 2 dice')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roll' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('applies advantage and disadvantage presets for a die keep control', () => {
    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d8' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d8' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d8' }))

    fireEvent.click(screen.getByRole('button', { name: 'Set advantage for d8' }))

    expect(screen.getByLabelText('Formula')).toHaveValue('2d8kh1')
    expect(screen.getByLabelText('Count for d8')).toHaveTextContent('2')
    expect(screen.getByLabelText('Keep mode for d8')).toHaveValue('kh')
    expect(screen.getByLabelText('Keep count for d8')).toHaveValue(1)

    fireEvent.click(screen.getByRole('button', { name: 'Set disadvantage for d8' }))

    expect(screen.getByLabelText('Formula')).toHaveValue('2d8kl1')
    expect(screen.getByLabelText('Keep mode for d8')).toHaveValue('kl')
    expect(screen.getByLabelText('Keep count for d8')).toHaveValue(1)
  })

  it('normalizes typed d% formulas on blur', () => {
    renderFormulaScreen(['/formula/new'])

    fireEvent.change(screen.getByLabelText('Formula'), {
      target: { value: 'd%' },
    })
    fireEvent.blur(screen.getByLabelText('Formula'))

    expect(screen.getByLabelText('Formula')).toHaveValue('1d100')
    expect(screen.getByLabelText('Count for d%')).toHaveTextContent('1')
  })

  it('shows an invalid formula error without overwriting the picker state', () => {
    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    expect(screen.getByLabelText('Count for d6')).toHaveTextContent('1')

    fireEvent.change(screen.getByLabelText('Formula'), {
      target: { value: 'garbage' },
    })
    fireEvent.blur(screen.getByLabelText('Formula'))

    expect(screen.getByText('Invalid formula')).toBeInTheDocument()
    expect(screen.getByLabelText('Formula')).toHaveValue('garbage')
    expect(screen.getByLabelText('Count for d6')).toHaveTextContent('1')
  })

  it('validates the name, saves a new formula, and returns to main with a toast', async () => {
    renderFormulaScreen(['/', '/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Please enter a name')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Formula name'), {
      target: { value: 'Sneak Attack' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(useAppStore.getState().savedFormulas).toHaveLength(1)
    expect(useAppStore.getState().savedFormulas[0].name).toBe('Sneak Attack')
    expect(useAppStore.getState().savedFormulas[0].formula).toBe('1d6')
    expect(screen.getByTestId('redirect-intent')).toHaveTextContent('/')
  })

  it('updates an existing formula in place on save', () => {
    useAppStore.setState({
      savedFormulas: [
        {
          id: 'formula-1',
          name: 'Attack Roll',
          formula: '1d20+5',
          createdAt: 10,
          updatedAt: 20,
        },
      ],
    })

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'))
    renderFormulaScreen(['/', '/formula/formula-1'])

    fireEvent.change(screen.getByPlaceholderText('Formula name'), {
      target: { value: 'Attack Roll+' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add d4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(useAppStore.getState().savedFormulas).toHaveLength(1)
    expect(useAppStore.getState().savedFormulas[0]).toMatchObject({
      id: 'formula-1',
      name: 'Attack Roll+',
      formula: '1d4+1d20+5',
      createdAt: 10,
      updatedAt: new Date('2026-04-27T12:00:00.000Z').getTime(),
    })
  })

  it('shows an inline roll error for a non-empty invalid formula', () => {
    renderFormulaScreen(['/formula/new'])

    fireEvent.change(screen.getByLabelText('Formula'), {
      target: { value: 'garbage' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(screen.getByText('Invalid formula — please check and try again')).toBeInTheDocument()
  })

  it('scrolls the roll engine into view when roll is clicked', async () => {
    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    })

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled()
    })
    expect(screen.getByText('Awaiting roll results...')).toBeInTheDocument()
  })

  it('opens an existing formula in roll view when the route requests roll-engine focus', async () => {
    useAppStore.setState({
      savedFormulas: [
        {
          id: 'formula-1',
          name: 'Attack Roll',
          formula: '1d20+5',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    renderFormulaScreen([{ pathname: '/formula/formula-1', state: { focusRollEngine: true } }])

    expect(screen.getByPlaceholderText('Formula name')).toHaveValue('Attack Roll')
    expect(screen.getByText('Press Roll to start collecting results.')).toBeInTheDocument()
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled()
    })
  })

  it('renders a saved formula in roll-only mode and auto-hides it after 10 seconds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'))

    useAppStore.setState({
      savedFormulas: [
        {
          id: 'formula-1',
          name: 'Attack Roll',
          formula: '1d20+5',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      pixels: {
        'pixel-d20': {
          pixelId: 'pixel-d20',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/roll/formula-1'])

    expect(screen.queryByPlaceholderText('Formula name')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.getByText('Roll Only')).toBeInTheDocument()
    expect(screen.getByText('Attack Roll')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Roll' })).not.toBeInTheDocument()

    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'Cancel roll' })).toBeInTheDocument()

    await act(async () => {
      rollCallback?.('pixel-d20', 18, 'd20')
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900)
      await Promise.resolve()
    })

    expect(screen.getByText(/Grand total:\s*23/)).toBeInTheDocument()
    expect(screen.getByLabelText('Roll screen closes in 10 seconds')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(screen.getByLabelText('Roll screen closes in 5 seconds')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })

  it('glows a connected die, then reprompts after 5 seconds of no settled results', async () => {
    vi.useFakeTimers()

    useAppStore.setState({
      pixels: {
        'pixel-d6': {
          pixelId: 'pixel-d6',
          dieType: 'd6',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'Cancel roll' })).toBeInTheDocument()
    expect(mockGlowDie).toHaveBeenCalledWith('pixel-d6')

    await act(async () => {
      rollCallback?.('pixel-d6', 5, 'd6')
      await Promise.resolve()
    })

    expect(mockGlowDie).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_900)
    })

    expect(mockGlowDie).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    await act(async () => {
      rollCallback?.('pixel-d6', 2, 'd6')
      await Promise.resolve()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockStopAllGlows).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Cancel roll' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roll Again' })).toBeInTheDocument()
    expect(useAppStore.getState().rollHistory).toHaveLength(1)
    expect(useAppStore.getState().rollHistory[0]).toMatchObject({
      formulaString: '2d6',
      total: 7,
    })
  })

  it('pauses periodic reprompts while settled roll results are still arriving', async () => {
    vi.useFakeTimers()

    useAppStore.setState({
      pixels: {
        'pixel-d20-a': {
          pixelId: 'pixel-d20-a',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
        'pixel-d20-b': {
          pixelId: 'pixel-d20-b',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 75,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockGlowDie).toHaveBeenCalledTimes(2)

    await act(async () => {
      rollCallback?.('pixel-d20-a', 18, 'd20')
      await Promise.resolve()
    })

    mockGlowDie.mockClear()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_900)
    })

    expect(mockGlowDie).toHaveBeenCalledTimes(0)

    await act(async () => {
      rollCallback?.('pixel-d20-b', 11, 'd20')
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_900)
    })

    expect(mockGlowDie).toHaveBeenCalledTimes(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(mockGlowDie).toHaveBeenCalledTimes(1)
  })

  it('keeps periodic reprompts paused while a pending assigned die is actively rolling', async () => {
    vi.useFakeTimers()

    useAppStore.setState({
      pixels: {
        'pixel-d20-a': {
          pixelId: 'pixel-d20-a',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
          isRolling: false,
        },
        'pixel-d20-b': {
          pixelId: 'pixel-d20-b',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 75,
          lastFace: null,
          isRolling: false,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockGlowDie).toHaveBeenCalledTimes(2)

    await act(async () => {
      rollCallback?.('pixel-d20-a', 18, 'd20')
      await Promise.resolve()
    })

    mockGlowDie.mockClear()

    await act(async () => {
      useAppStore.setState({
        pixels: {
          'pixel-d20-a': {
            pixelId: 'pixel-d20-a',
            dieType: 'd20',
            connectionState: 'connected',
            batteryLevel: 80,
            lastFace: 18,
            isRolling: false,
          },
          'pixel-d20-b': {
            pixelId: 'pixel-d20-b',
            dieType: 'd20',
            connectionState: 'connected',
            batteryLevel: 75,
            lastFace: null,
            isRolling: true,
          },
        },
      })
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(mockGlowDie).toHaveBeenCalledTimes(0)

    await act(async () => {
      useAppStore.setState({
        pixels: {
          'pixel-d20-a': {
            pixelId: 'pixel-d20-a',
            dieType: 'd20',
            connectionState: 'connected',
            batteryLevel: 80,
            lastFace: 18,
            isRolling: false,
          },
          'pixel-d20-b': {
            pixelId: 'pixel-d20-b',
            dieType: 'd20',
            connectionState: 'connected',
            batteryLevel: 75,
            lastFace: null,
            isRolling: false,
          },
        },
      })
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_900)
    })

    expect(mockGlowDie).toHaveBeenCalledTimes(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(mockGlowDie).toHaveBeenCalledTimes(2)
    expect(mockGlowDie).toHaveBeenCalledWith('pixel-d20-b')
  })

  it('routes missing dice to manual entry and completes after submit', async () => {
    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(await screen.findByLabelText('d6 #1')).toBeInTheDocument()
    expect(mockGlowDie).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('d6 #1'), {
      target: { value: '4' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit manual rolls' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel roll' })).not.toBeInTheDocument())
    expect(screen.getByText(/Grand total:\s*4/)).toBeInTheDocument()
    expect(useAppStore.getState().rollHistory).toHaveLength(1)
    expect(useAppStore.getState().rollHistory[0]).toMatchObject({
      formulaString: '1d6',
      total: 4,
    })
  })

  it('treats d% as paired d100 and d10 manual rolls', async () => {
    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d%' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(await screen.findByLabelText('d% #1 tens')).toBeInTheDocument()
    expect(screen.getByLabelText('d% #1 ones')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('d% #1 tens'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('d% #1 ones'), {
      target: { value: '4' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit manual rolls' }))

    expect(await screen.findByText(/Grand total:\s*4/)).toBeInTheDocument()
    expect(useAppStore.getState().rollHistory[0]).toMatchObject({
      formulaString: '1d100',
      total: 4,
    })
  })

  it('falls back to manual entry when a connected die disconnects mid-roll', async () => {
    useAppStore.setState({
      pixels: {
        'pixel-d6': {
          pixelId: 'pixel-d6',
          dieType: 'd6',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await screen.findByRole('button', { name: 'Cancel roll' })

    await act(async () => {
      useAppStore.setState({
        pixels: {
          'pixel-d6': {
            pixelId: 'pixel-d6',
            dieType: 'd6',
            connectionState: 'disconnected',
            batteryLevel: 80,
            lastFace: null,
          },
        },
      })
    })

    expect(await screen.findByText('d6 disconnected — enter result manually.')).toBeInTheDocument()
    expect(screen.getByLabelText('d6 #1')).toBeInTheDocument()
    expect(screen.getByLabelText('d6 #2')).toBeInTheDocument()
  })

  it('tries reconnecting remembered dice instead of falling back to manual when the type is known', async () => {
    useAppStore.setState({
      pairedPixelIds: ['pixel-d6-memory'],
      pairedPixels: {
        'pixel-d6-memory': {
          pixelId: 'pixel-d6-memory',
          dieType: 'd6',
          lastUsedAt: 10,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await waitFor(() =>
      expect(mockConnectRememberedDie).toHaveBeenCalledWith('pixel-d6-memory', {
        suppressErrors: true,
      }),
    )
    expect(screen.queryByRole('button', { name: 'Submit manual rolls' })).not.toBeInTheDocument()
    expect(screen.getByText('Trying to reconnect remembered dice...')).toBeInTheDocument()
  })

  it('disconnects the least recently used unrelated dice before reconnecting remembered required dice', async () => {
    useAppStore.setState({
      pairedPixelIds: ['pixel-d4', 'pixel-d6-needed', 'pixel-d8'],
      pairedPixels: {
        'pixel-d4': {
          pixelId: 'pixel-d4',
          dieType: 'd4',
          lastUsedAt: 10,
        },
        'pixel-d6-needed': {
          pixelId: 'pixel-d6-needed',
          dieType: 'd6',
          lastUsedAt: 100,
        },
        'pixel-d8': {
          pixelId: 'pixel-d8',
          dieType: 'd8',
          lastUsedAt: 20,
        },
      },
      pixels: {
        'pixel-d4': {
          pixelId: 'pixel-d4',
          dieType: 'd4',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
        'pixel-d8': {
          pixelId: 'pixel-d8',
          dieType: 'd8',
          connectionState: 'connected',
          batteryLevel: 75,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await waitFor(() => expect(mockDisconnectDie).toHaveBeenCalledWith('pixel-d4', 'required-for-roll-disconnect'))
    await waitFor(() =>
      expect(mockConnectRememberedDie).toHaveBeenCalledWith('pixel-d6-needed', {
        suppressErrors: true,
      }),
    )
    expect(mockDisconnectDie).not.toHaveBeenCalledWith('pixel-d8')
  })

  it('keeps the completed result visible until roll again is pressed', async () => {
    useAppStore.setState({
      pixels: {
        'pixel-d20': {
          pixelId: 'pixel-d20',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await act(async () => {
      rollCallback?.('pixel-d20', 18, 'd20')
    })

    expect(await screen.findByRole('dialog', { name: '1d20' })).toBeInTheDocument()
    expect(screen.queryByText('Rolled dice')).not.toBeInTheDocument()
    expect(screen.queryByText('Total: 18')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close result panel' }))

    expect(screen.queryByRole('dialog', { name: '1d20' })).not.toBeInTheDocument()
    expect(await screen.findByText('Total: 18')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Roll Again' }))

    expect(await screen.findByRole('button', { name: 'Cancel roll' })).toBeInTheDocument()
    expect(screen.getByLabelText('d20 #1 pending')).toBeInTheDocument()
  })

  it('marks dropped dice in the completed roll screen for keep-high formulas', async () => {
    useAppStore.setState({
      pixels: {
        'pixel-d20-a': {
          pixelId: 'pixel-d20-a',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
        'pixel-d20-b': {
          pixelId: 'pixel-d20-b',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 75,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Set advantage for d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await act(async () => {
      rollCallback?.('pixel-d20-a', 18, 'd20')
    })

    await act(async () => {
      rollCallback?.('pixel-d20-b', 7, 'd20')
    })

    expect(await screen.findByText(/Grand total:\s*18/)).toBeInTheDocument()
  })

  it('accepts either matching die when extra rolls are needed for a shared die type', async () => {
    useAppStore.setState({
      pixels: {
        'pixel-d20-a': {
          pixelId: 'pixel-d20-a',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
        'pixel-d20-b': {
          pixelId: 'pixel-d20-b',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 75,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await act(async () => {
      rollCallback?.('pixel-d20-a', 18, 'd20')
    })

    await act(async () => {
      rollCallback?.('pixel-d20-b', 11, 'd20')
    })

    await act(async () => {
      rollCallback?.('pixel-d20-b', 7, 'd20')
    })

    await waitFor(() =>
      expect(useAppStore.getState().rollHistory[0]).toMatchObject({
        formulaString: '3d20',
        total: 36,
      }),
    )
    expect(await screen.findByRole('button', { name: 'Roll Again' })).toBeInTheDocument()
  })

  it('combines paired d% BLE rolls into one logical result', async () => {
    useAppStore.setState({
      pixels: {
        'pixel-d100': {
          pixelId: 'pixel-d100',
          dieType: 'd100',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
        'pixel-d10': {
          pixelId: 'pixel-d10',
          dieType: 'd10',
          connectionState: 'connected',
          batteryLevel: 75,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d%' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await waitFor(() => expect(mockGlowDie).toHaveBeenCalledTimes(2))
    expect(mockGlowDie).toHaveBeenCalledWith('pixel-d100')
    expect(mockGlowDie).toHaveBeenCalledWith('pixel-d10')

    await act(async () => {
      rollCallback?.('pixel-d100', 21, 'd100')
      await Promise.resolve()
    })

    expect(screen.getByLabelText('d% #1 pending')).toBeInTheDocument()

    await act(async () => {
      rollCallback?.('pixel-d10', 0, 'd10')
      await Promise.resolve()
    })

    expect(await screen.findByText(/Grand total:\s*20/)).toBeInTheDocument()
  })

  it('maps paired zero d% rolls to 100', async () => {
    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d%' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    fireEvent.change(await screen.findByLabelText('d% #1 tens'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('d% #1 ones'), {
      target: { value: '0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit manual rolls' }))

    expect(await screen.findByText(/Grand total:\s*100/)).toBeInTheDocument()
  })

  it('glows only the required number of matching connected dice, chosen at random', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    useAppStore.setState({
      pixels: {
        'pixel-d20-a': {
          pixelId: 'pixel-d20-a',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
        'pixel-d20-b': {
          pixelId: 'pixel-d20-b',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 75,
          lastFace: null,
        },
        'pixel-d20-c': {
          pixelId: 'pixel-d20-c',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 70,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await waitFor(() => expect(mockGlowDie).toHaveBeenCalledTimes(2))
    expect(mockGlowDie).toHaveBeenCalledWith('pixel-d20-b')
    expect(mockGlowDie).toHaveBeenCalledWith('pixel-d20-c')
    expect(mockGlowDie).not.toHaveBeenCalledWith('pixel-d20-a')

    randomSpy.mockRestore()
  })

  it('clicking a pending die reglows only the remaining assigned dice', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    useAppStore.setState({
      pixels: {
        'pixel-d20-a': {
          pixelId: 'pixel-d20-a',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
        'pixel-d20-b': {
          pixelId: 'pixel-d20-b',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 75,
          lastFace: null,
        },
        'pixel-d20-c': {
          pixelId: 'pixel-d20-c',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 70,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await waitFor(() => expect(mockGlowDie).toHaveBeenCalledTimes(2))
    expect(mockGlowDie).toHaveBeenCalledWith('pixel-d20-b')
    expect(mockGlowDie).toHaveBeenCalledWith('pixel-d20-c')

    await act(async () => {
      rollCallback?.('pixel-d20-b', 18, 'd20')
      await Promise.resolve()
    })

    mockGlowDie.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'd20 #2 pending' }))

    await waitFor(() => expect(mockGlowDie).toHaveBeenCalledTimes(1))
    expect(mockGlowDie).toHaveBeenCalledWith('pixel-d20-c')
    expect(mockGlowDie).not.toHaveBeenCalledWith('pixel-d20-a')
    expect(mockGlowDie).not.toHaveBeenCalledWith('pixel-d20-b')

    randomSpy.mockRestore()
  })

  it('re-picks pending glow dice after the connected pool changes', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    useAppStore.setState({
      pixels: {
        'pixel-d20-a': {
          pixelId: 'pixel-d20-a',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
        'pixel-d20-b': {
          pixelId: 'pixel-d20-b',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 75,
          lastFace: null,
        },
        'pixel-d20-c': {
          pixelId: 'pixel-d20-c',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 70,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await waitFor(() => expect(mockGlowDie).toHaveBeenCalledTimes(2))

    await act(async () => {
      useAppStore.setState({
        pixels: {
          'pixel-d20-a': {
            pixelId: 'pixel-d20-a',
            dieType: 'd20',
            connectionState: 'connected',
            batteryLevel: 80,
            lastFace: null,
          },
          'pixel-d20-b': {
            pixelId: 'pixel-d20-b',
            dieType: 'd20',
            connectionState: 'connected',
            batteryLevel: 75,
            lastFace: null,
          },
          'pixel-d20-d': {
            pixelId: 'pixel-d20-d',
            dieType: 'd20',
            connectionState: 'connected',
            batteryLevel: 70,
            lastFace: null,
          },
        },
      })
      await Promise.resolve()
    })

    mockGlowDie.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'd20 #1 pending' }))

    await waitFor(() => expect(mockGlowDie).toHaveBeenCalledTimes(2))
    expect(mockGlowDie).toHaveBeenCalledWith('pixel-d20-b')
    expect(mockGlowDie).toHaveBeenCalledWith('pixel-d20-d')
    expect(mockGlowDie).not.toHaveBeenCalledWith('pixel-d20-c')

    randomSpy.mockRestore()
  })

  it('clicking a pending die after a partial shared-die roll glows only the remaining number needed', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    useAppStore.setState({
      pixels: {
        'pixel-d8-a': {
          pixelId: 'pixel-d8-a',
          dieType: 'd8',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
        'pixel-d8-b': {
          pixelId: 'pixel-d8-b',
          dieType: 'd8',
          connectionState: 'connected',
          batteryLevel: 75,
          lastFace: null,
        },
        'pixel-d8-c': {
          pixelId: 'pixel-d8-c',
          dieType: 'd8',
          connectionState: 'connected',
          batteryLevel: 70,
          lastFace: null,
        },
        'pixel-d8-d': {
          pixelId: 'pixel-d8-d',
          dieType: 'd8',
          connectionState: 'connected',
          batteryLevel: 65,
          lastFace: null,
        },
      },
    })

    renderFormulaScreen(['/formula/new'])

    for (let index = 0; index < 6; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Add d8' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    await waitFor(() => expect(mockGlowDie).toHaveBeenCalledTimes(4))

    await act(async () => {
      rollCallback?.('pixel-d8-a', 8, 'd8')
      await Promise.resolve()
    })
    await act(async () => {
      rollCallback?.('pixel-d8-b', 7, 'd8')
      await Promise.resolve()
    })
    await act(async () => {
      rollCallback?.('pixel-d8-c', 6, 'd8')
      await Promise.resolve()
    })
    await act(async () => {
      rollCallback?.('pixel-d8-d', 5, 'd8')
      await Promise.resolve()
    })

    mockGlowDie.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'd8 #5 pending' }))

    await waitFor(() => expect(mockGlowDie).toHaveBeenCalledTimes(2))
    const glowedPixelIds = new Set(mockGlowDie.mock.calls.map((call) => String((call as any)[0])))
    expect(glowedPixelIds.size).toBe(2)
    expect(Array.from(glowedPixelIds).every((pixelId) => pixelId.startsWith('pixel-d8-'))).toBe(true)

    randomSpy.mockRestore()
  })

})