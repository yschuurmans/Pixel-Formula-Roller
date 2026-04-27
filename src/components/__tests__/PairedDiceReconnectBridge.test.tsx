import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PairedDiceReconnectBridge, { resetInitialReconnectForTests } from '../PairedDiceReconnectBridge'
import { useAppStore } from '../../stores/useAppStore'

const { reconnectPairedDiceMock } = vi.hoisted(() => ({
  reconnectPairedDiceMock: vi.fn(),
}))

vi.mock('../../services/pixelsService', () => ({
  reconnectPairedDice: reconnectPairedDiceMock,
}))

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

describe('PairedDiceReconnectBridge', () => {
  beforeEach(() => {
    resetStore()
    reconnectPairedDiceMock.mockReset()
    resetInitialReconnectForTests()
  })

  afterEach(() => {
    resetInitialReconnectForTests()
  })

  it('auto-reconnects paired dice after hydration on page load', async () => {
    useAppStore.setState({ pairedPixelIds: ['pixel-1'] })

    render(<PairedDiceReconnectBridge />)

    await waitFor(() => {
      expect(reconnectPairedDiceMock).toHaveBeenCalledWith({ suppressFailureError: true })
    })
  })

  it('does not auto-reconnect when there are no remembered dice', async () => {
    render(<PairedDiceReconnectBridge />)

    await waitFor(() => {
      expect(reconnectPairedDiceMock).not.toHaveBeenCalled()
    })
  })
})