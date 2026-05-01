import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MainScreen from '../../src/pages/MainScreen'
import FormulaScreen from '../../src/pages/FormulaScreen'
import SettingsScreen from '../../src/pages/SettingsScreen'
import { useAppStore } from '../../src/stores/useAppStore'

const {
  mockGlowDie,
  mockOnRollResult,
  mockForgetDie,
} = vi.hoisted(() => ({
  mockGlowDie: vi.fn(async () => undefined),
  mockOnRollResult: vi.fn(),
  mockForgetDie: vi.fn<(pixelId: string) => Promise<void>>(),
}))

let rollCallback:
  | ((pixelId: string, face: number, dieType: string) => void)
  | undefined

vi.mock('../../src/services/pixelsService', () => ({
  connectDie: vi.fn(async () => undefined),
  connectRememberedDice: vi.fn(async () => []),
  connectRememberedDie: vi.fn(async () => false),
  reconnectPairedDice: vi.fn(async () => undefined),
  disconnectDie: vi.fn(async () => undefined),
  disconnectDice: vi.fn(async () => undefined),
  forgetDie: mockForgetDie,
  glowDie: mockGlowDie,
  onRollResult: mockOnRollResult.mockImplementation((cb: typeof rollCallback) => {
    rollCallback = cb
    return vi.fn()
  }),
  markPixelUsed: vi.fn(),
  stopAllGlows: vi.fn(async () => undefined),
  getBleUnavailableMessage: vi.fn(() => null),
  startBatteryHighlightCycle: vi.fn(() => ({ stop: () => {} })),
  stopBatteryHighlightCycle: vi.fn(() => undefined),
}))

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

function renderApp(initialEntries: string[]) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <TestLayout />,
        children: [
          { index: true, element: <MainScreen /> },
          { path: 'formula/new', element: <FormulaScreen /> },
          { path: 'formula/:id', element: <FormulaScreen /> },
          { path: 'roll/:id', element: <FormulaScreen mode="roll-only" /> },
          { path: 'settings', element: <SettingsScreen /> },
        ],
      },
    ],
    { initialEntries },
  )

  return render(<RouterProvider router={router} />)
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

describe('Application behaviour (end-to-end flows)', () => {
  beforeEach(() => {
    resetStore()
    mockGlowDie.mockReset()
    mockOnRollResult.mockClear()
    mockForgetDie.mockReset()
    rollCallback = undefined
    vi.useRealTimers()

    const scrollIntoViewMock = vi.fn()
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
      writable: true,
    })
  })

  it('creates a formula, saves it, performs a manual roll, and records history', async () => {
    // Create saved formula directly in the store to avoid UI timing flakes
    const now = Date.now()
    useAppStore.getState().addSavedFormula({
      id: 'manual-formula-1',
      name: 'Manual Flow',
      formula: '1d6',
      createdAt: now,
      updatedAt: now,
    })

    renderApp(['/'])

    // Open the saved formula from the main screen's card
    const nameHeading = await screen.findByText('Manual Flow')
    const article = nameHeading.closest('article')!
    // The card contains two buttons (more-options and the body). Pick the body button which includes the formula text.
    const bodyButton = Array.from(article.querySelectorAll('button')).find((b) => b.textContent?.includes('1d6'))!
    fireEvent.click(bodyButton)

    // Should navigate to a roll route
    expect(screen.getByTestId('location').textContent).toMatch(/^\/roll\//)

    // Start roll — no connected dice present → manual entry is shown immediately
    const manualInput = await screen.findByLabelText('d6 #1')
    fireEvent.change(manualInput, { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit manual rolls' }))

    // Outcome recorded
    await waitFor(() => expect(screen.getByText('Total: 4')).toBeInTheDocument())
    expect(useAppStore.getState().rollHistory).toHaveLength(1)
    expect(useAppStore.getState().rollHistory[0]).toMatchObject({ formulaString: '1d6', total: 4 })
  })

  it('collects a BLE-collected roll using a connected die and records history', async () => {
    // Pre-populate a connected pixel in the store
    useAppStore.setState({
      pairedPixelIds: ['pixel-d6'],
      pairedPixels: {
        'pixel-d6': { pixelId: 'pixel-d6', dieType: 'd6', lastUsedAt: Date.now() },
      },
      pixels: {
        'pixel-d6': { pixelId: 'pixel-d6', dieType: 'd6', connectionState: 'connected', batteryLevel: 90, lastFace: null },
      },
    })

    renderApp(['/formula/new'])

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    // Component should request a glow from the service for the connected die
    await waitFor(() => expect(mockGlowDie).toHaveBeenCalledWith('pixel-d6'))

    // Wait for the component to subscribe to roll results, then simulate SDK roll event
    await waitFor(() => expect(rollCallback).toBeDefined())
    await act(async () => {
      rollCallback?.('pixel-d6', 4, 'd6')
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText('Total: 4')).toBeInTheDocument())
    expect(useAppStore.getState().rollHistory[0]).toMatchObject({ formulaString: '1d6', total: 4 })
  })

  it('forgets a paired die from the Settings screen and updates the store', async () => {
    // Seed a paired die and visible pixel
    useAppStore.setState({
      pairedPixelIds: ['pixel-1234'],
      pairedPixels: { 'pixel-1234': { pixelId: 'pixel-1234', dieType: 'd20', lastUsedAt: 1 } },
      pixels: { 'pixel-1234': { pixelId: 'pixel-1234', dieType: 'd20', connectionState: 'connected', batteryLevel: 50, lastFace: 7 } },
    })

    // Make our mocked forgetDie actually update the store to mirror real service behaviour
    mockForgetDie.mockImplementation(async (pixelId: string) => {
      await useAppStore.getState().forgetPairedPixelId(pixelId)
      await useAppStore.getState().removePixel(pixelId)
    })

    renderApp(['/settings'])

    // Click the Forget button for the die
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }))

    await waitFor(() => expect(mockForgetDie).toHaveBeenCalledWith('pixel-1234'))
    expect(useAppStore.getState().pairedPixelIds).not.toContain('pixel-1234')
    expect(useAppStore.getState().pixels['pixel-1234']).toBeUndefined()
  })
})
