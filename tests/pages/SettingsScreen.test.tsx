import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsScreen from '../../src/pages/SettingsScreen'
import { useAppStore } from '../../src/stores/useAppStore'

const {
  connectRememberedDiceMock,
  connectDieMock,
  disconnectDieMock,
  forgetDieMock,
  getBleUnavailableMessageMock,
  glowCleanupOrientationMock,
  glowDieMock,
  reconnectPairedDiceMock,
  stopGlowMock,
} = vi.hoisted(() => ({
  connectRememberedDiceMock: vi.fn(),
  connectDieMock: vi.fn(),
  disconnectDieMock: vi.fn(),
  forgetDieMock: vi.fn(),
  getBleUnavailableMessageMock: vi.fn(() => 'Bluetooth is unavailable in this Android build because the native Pixels BLE bridge is not implemented yet.'),
  glowCleanupOrientationMock: vi.fn(),
  glowDieMock: vi.fn(),
  reconnectPairedDiceMock: vi.fn(),
  stopGlowMock: vi.fn(),
}))

vi.mock('../../src/services/pixelsService', () => ({
  connectRememberedDice: connectRememberedDiceMock,
  connectDie: connectDieMock,
  disconnectDie: disconnectDieMock,
  forgetDie: forgetDieMock,
  getBleUnavailableMessage: getBleUnavailableMessageMock,
  glowCleanupOrientation: glowCleanupOrientationMock,
  glowDie: glowDieMock,
  reconnectPairedDice: reconnectPairedDiceMock,
  stopGlow: stopGlowMock,
}))

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderSettingsScreen() {
  return render(
    <MemoryRouter initialEntries={['/', '/settings']} initialIndex={1}>
      <Routes>
        <Route path="/" element={<LocationDisplay />} />
        <Route
          path="/settings"
          element={
            <>
              <SettingsScreen />
              <LocationDisplay />
            </>
          }
        />
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

describe('SettingsScreen', () => {
  beforeEach(() => {
    resetStore()
    connectRememberedDiceMock.mockReset()
    connectDieMock.mockReset()
    disconnectDieMock.mockReset()
    forgetDieMock.mockReset()
    glowCleanupOrientationMock.mockReset()
    glowDieMock.mockReset()
    getBleUnavailableMessageMock.mockClear()
    reconnectPairedDiceMock.mockReset()
    stopGlowMock.mockReset()
    vi.useRealTimers()
  })

  it('navigates back to the main screen', () => {
    renderSettingsScreen()

    fireEvent.click(screen.getByRole('button', { name: '← Back' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })

  it('shows empty state and calls connectDie when requested', async () => {
    connectDieMock.mockResolvedValue(undefined)
    renderSettingsScreen()

    expect(screen.getByText("No dice connected — tap 'Connect new die' to get started")).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect new die' }))
    })

    expect(connectDieMock).toHaveBeenCalledTimes(1)
  })

  it('disables connect when BLE is unavailable and shows guidance', () => {
    useAppStore.setState({ bleAvailable: false })
    renderSettingsScreen()

    const button = screen.getByRole('button', { name: 'Connect new die' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Bluetooth is unavailable in this Android build because the native Pixels BLE bridge is not implemented yet.')
    expect(screen.getByRole('button', { name: 'Reconnect paired dice' })).toBeDisabled()
    expect(screen.getByText('Bluetooth is unavailable in this Android build because the native Pixels BLE bridge is not implemented yet.')).toBeInTheDocument()
  })

  it('keeps connect enabled when only a BLE permission error is present', () => {
    useAppStore.setState({
      bleAvailable: true,
      bleError: "Bluetooth permission denied. Tap 'Connect' to try again.",
    })

    renderSettingsScreen()

    expect(screen.getByRole('button', { name: 'Connect new die' })).toBeEnabled()
  })

  it('reconnects previously paired dice without opening the picker', async () => {
    reconnectPairedDiceMock.mockResolvedValue(undefined)
    useAppStore.setState({ pairedPixelIds: ['pixel-1234'] })
    renderSettingsScreen()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reconnect paired dice' }))
    })

    expect(reconnectPairedDiceMock).toHaveBeenCalledWith({ allowPromptFallback: true })
  })

  it('renders dice rows, flashes from the die icon, disconnects connected dice, and can forget remembered dice', async () => {
    useAppStore.setState({
      pixels: {
        'pixel-1234': {
          pixelId: 'pixel-1234',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 82,
          lastFace: 17,
        },
      },
    })

    renderSettingsScreen()

    expect(screen.getByText('Pixel …1234')).toBeInTheDocument()
    expect(screen.getByText('Battery: 82%')).toBeInTheDocument()
    expect(screen.getByText('Last face: 17')).toBeInTheDocument()
    expect(screen.getByLabelText('Connected')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Flash Pixel 1234' }))
    })
    expect(glowDieMock).toHaveBeenCalledWith('pixel-1234')

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(disconnectDieMock).toHaveBeenCalledWith('pixel-1234')

    fireEvent.click(screen.getByRole('button', { name: 'Forget' }))
    expect(forgetDieMock).toHaveBeenCalledWith('pixel-1234')
  })

  it('flashes all connected dice', async () => {
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

    renderSettingsScreen()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Flash all dice' }))
    })

    expect(glowDieMock).toHaveBeenCalledTimes(2)
    expect(glowDieMock).toHaveBeenCalledWith('pixel-1234')
    expect(glowDieMock).toHaveBeenCalledWith('pixel-4321')
  })

  it('renders cleanup toggles and keeps only one active at a time', async () => {
    useAppStore.setState({
      pairedPixels: {
        'pixel-d6-a': {
          pixelId: 'pixel-d6-a',
          dieType: 'd6',
          lastUsedAt: 10,
        },
        'pixel-d20-a': {
          pixelId: 'pixel-d20-a',
          dieType: 'd20',
          lastUsedAt: 20,
        },
      },
      pixels: {
        'pixel-d6-live': {
          pixelId: 'pixel-d6-live',
          dieType: 'd6',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
      },
    })

    renderSettingsScreen()

    const d6Toggle = screen.getByRole('switch', { name: 'd6 cleanup' })
    const d20Toggle = screen.getByRole('switch', { name: 'd20 cleanup' })

    await act(async () => {
      fireEvent.click(d6Toggle)
    })

    expect(d6Toggle).toBeChecked()
    expect(d20Toggle).not.toBeChecked()
    expect(connectRememberedDiceMock).toHaveBeenCalledWith(
      ['pixel-d6-a'],
      {
        suppressErrors: true,
        continueOnError: true,
      },
      'cleanup-reconnect',
    )
    expect(glowCleanupOrientationMock).toHaveBeenCalledWith('pixel-d6-live', {
      baseColor: { r: 40, g: 40, b: 40 },
      lowFaceColor: { r: 255, g: 68, b: 68 },
      highFaceColor: { r: 34, g: 255, b: 94 },
    })

    await act(async () => {
      fireEvent.click(d20Toggle)
    })

    expect(d6Toggle).not.toBeChecked()
    expect(d20Toggle).toBeChecked()
    expect(stopGlowMock).toHaveBeenCalledWith('pixel-d6-live')
  })

  it('repeats cleanup reconnects and glow for the active die type', async () => {
    vi.useFakeTimers()

    useAppStore.setState({
      pairedPixels: {
        'pixel-d6-a': {
          pixelId: 'pixel-d6-a',
          dieType: 'd6',
          lastUsedAt: 10,
        },
      },
      pixels: {
        'pixel-d6-live': {
          pixelId: 'pixel-d6-live',
          dieType: 'd6',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: null,
        },
      },
    })

    renderSettingsScreen()

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'd6 cleanup' }))
      await Promise.resolve()
    })

    expect(connectRememberedDiceMock).toHaveBeenCalledTimes(1)
    expect(glowCleanupOrientationMock).toHaveBeenCalledWith('pixel-d6-live', {
      baseColor: { r: 40, g: 40, b: 40 },
      lowFaceColor: { r: 255, g: 68, b: 68 },
      highFaceColor: { r: 34, g: 255, b: 94 },
    })

    connectRememberedDiceMock.mockClear()
    glowCleanupOrientationMock.mockClear()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(glowCleanupOrientationMock).toHaveBeenCalledWith('pixel-d6-live', {
      baseColor: { r: 40, g: 40, b: 40 },
      lowFaceColor: { r: 255, g: 68, b: 68 },
      highFaceColor: { r: 34, g: 255, b: 94 },
    })
    expect(connectRememberedDiceMock).toHaveBeenCalledTimes(15)

    connectRememberedDiceMock.mockClear()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(connectRememberedDiceMock).toHaveBeenCalledTimes(1)
  })

  it('targets the cleanup glow to the lowest and highest faces without using lastFace', async () => {
    useAppStore.setState({
      pairedPixels: {
        'pixel-d20-a': {
          pixelId: 'pixel-d20-a',
          dieType: 'd20',
          lastUsedAt: 10,
        },
      },
      pixels: {
        'pixel-d20-a': {
          pixelId: 'pixel-d20-a',
          dieType: 'd20',
          connectionState: 'connected',
          batteryLevel: 80,
          lastFace: 7,
        },
      },
    })

    renderSettingsScreen()

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'd20 cleanup' }))
      await Promise.resolve()
    })

    expect(glowCleanupOrientationMock).toHaveBeenCalledWith('pixel-d20-a', {
      baseColor: { r: 40, g: 40, b: 40 },
      lowFaceColor: { r: 255, g: 68, b: 68 },
      highFaceColor: { r: 34, g: 255, b: 94 },
    })
  })
})