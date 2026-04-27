import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DiagnosticRollHistoryBridge from '../DiagnosticRollHistoryBridge'
import { useAppStore } from '../../stores/useAppStore'

const { unsubscribeMock } = vi.hoisted(() => ({
  unsubscribeMock: vi.fn(),
}))

let rollCallback:
  | ((
      pixelId: string,
      face: number,
      dieType: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100',
    ) => void)
  | undefined

vi.mock('../../services/pixelsService', () => ({
  onRollResult: vi.fn((callback: typeof rollCallback) => {
    rollCallback = callback
    return unsubscribeMock
  }),
}))

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

describe('DiagnosticRollHistoryBridge', () => {
  beforeEach(() => {
    resetStore()
    rollCallback = undefined
    unsubscribeMock.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T12:00:00.000Z'))
  })

  it('writes diagnostic roll entries into shared history when a die rolls', () => {
    render(<DiagnosticRollHistoryBridge />)

    act(() => {
      rollCallback?.('pixel-1111', 19, 'd20')
    })

    expect(useAppStore.getState().rollHistory).toHaveLength(1)
    expect(useAppStore.getState().rollHistory[0]).toMatchObject({
      formulaString: '1d20',
      total: 19,
      formulaName: '',
      rolledAt: new Date('2026-04-27T12:00:00.000Z').getTime(),
    })
  })
})