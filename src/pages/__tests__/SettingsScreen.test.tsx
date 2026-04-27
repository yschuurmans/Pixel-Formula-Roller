import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsScreen from '../SettingsScreen'
import { useAppStore } from '../../stores/useAppStore'

const {
  connectDieMock,
  disconnectDieMock,
  forgetDieMock,
  getBleUnavailableMessageMock,
  glowDieMock,
  reconnectPairedDiceMock,
  unsubscribeMock,
} = vi.hoisted(() => ({
  connectDieMock: vi.fn(),
  disconnectDieMock: vi.fn(),
  forgetDieMock: vi.fn(),
  getBleUnavailableMessageMock: vi.fn(() => 'Bluetooth is unavailable in this Android build because the native Pixels BLE bridge is not implemented yet.'),
  glowDieMock: vi.fn(),
  reconnectPairedDiceMock: vi.fn(),
  unsubscribeMock: vi.fn(),
}))

let rollCallback:
  | ((pixelId: string, face: number, dieType: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100') => void)
  | undefined

vi.mock('../../services/pixelsService', () => ({
  connectDie: connectDieMock,
  disconnectDie: disconnectDieMock,
  forgetDie: forgetDieMock,
  getBleUnavailableMessage: getBleUnavailableMessageMock,
  glowDie: glowDieMock,
  reconnectPairedDice: reconnectPairedDiceMock,
  onRollResult: vi.fn((callback: typeof rollCallback) => {
    rollCallback = callback
    return unsubscribeMock
  }),
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
    savedFormulas: [],
    rollHistory: [],
    settings: { theme: 'dark' },
    pairedPixelIds: [],
    bleAvailable: true,
    bleError: null,
    pixels: {},
  })
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    resetStore()
    connectDieMock.mockReset()
    disconnectDieMock.mockReset()
    forgetDieMock.mockReset()
    glowDieMock.mockReset()
    getBleUnavailableMessageMock.mockClear()
    reconnectPairedDiceMock.mockReset()
    unsubscribeMock.mockReset()
    rollCallback = undefined
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

  it('shows recent roll events from the Pixels service subscription', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'))
    renderSettingsScreen()

    act(() => {
      rollCallback?.('pixel-9876', 14, 'd20')
    })

    expect(screen.getByText('d20 rolled 14')).toBeInTheDocument()
    expect(screen.getByText('Pixel …9876')).toBeInTheDocument()
    expect(screen.getByText('less than a minute ago')).toBeInTheDocument()
    expect(useAppStore.getState().rollHistory).toHaveLength(0)
  })
})