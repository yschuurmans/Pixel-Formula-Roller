import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_WARNING_MESSAGE, useAppStore } from '../useAppStore'

function baseHistoryEntry(id: string) {
  return {
    id,
    formulaName: `Formula ${id}`,
    formulaString: '1d20+5',
    total: 10,
    rolledAt: 1,
    result: {
      groups: [],
      flatModifier: 5,
      total: 10,
    },
    parsedFormula: {
      groups: [{ dieType: 'd20' as const, count: 1 }],
      flatModifier: 5,
      raw: '1d20+5',
      canonical: '1d20+5',
    },
  }
}

describe('useAppStore persistence', () => {
  beforeEach(() => {
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
  })

  it('trims history and retries when localStorage quota is exceeded', () => {
    const warningListener = vi.fn()
    window.addEventListener('pixel-formula-roller:storage-warning', warningListener)

    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementationOnce(() => {
        throw new DOMException('full', 'QuotaExceededError')
      })
      .mockImplementation(() => undefined)

    useAppStore.setState({
      rollHistory: Array.from({ length: 30 }, (_, index) => baseHistoryEntry(String(index + 1))),
    })

    expect(setItemSpy).toHaveBeenCalledTimes(2)

    const retriedPayload = JSON.parse(setItemSpy.mock.calls[1][1])
    expect(retriedPayload.state.rollHistory).toHaveLength(25)
    expect(warningListener).toHaveBeenCalledTimes(1)
    expect((warningListener.mock.calls[0][0] as CustomEvent<{ message: string }>).detail.message).toBe(
      STORAGE_WARNING_MESSAGE,
    )

    window.removeEventListener('pixel-formula-roller:storage-warning', warningListener)
    setItemSpy.mockRestore()
  })

  it('drops legacy history length settings and keeps dark theme on migrate', async () => {
    const migrate = useAppStore.persist.getOptions().migrate

    const migrated = await migrate?.(
      {
        savedFormulas: [],
        rollHistory: [],
        settings: { historyLength: 50, theme: 'dark' },
        pairedPixelIds: ['pixel-1'],
      },
      1,
    )

    expect(migrated?.settings).toEqual({ theme: 'dark' })
    expect(migrated?.pairedPixelIds).toEqual(['pixel-1'])
  })
})