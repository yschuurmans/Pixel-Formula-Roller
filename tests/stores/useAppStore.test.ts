import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_WARNING_MESSAGE, useAppStore } from '../../src/stores/useAppStore'

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

describe('useAppStore persistence', () => {
  beforeEach(() => {
    resetStore()
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
      profiles: {
        default: {
          id: 'default',
          name: 'Default',
          formulas: [],
          history: Array.from({ length: 30 }, (_, index) => baseHistoryEntry(String(index + 1))),
          createdAt: 1,
          updatedAt: 1,
        },
      },
      activeProfileId: 'default',
    })

    expect(setItemSpy).toHaveBeenCalledTimes(2)

    const retriedPayload = JSON.parse(setItemSpy.mock.calls[1][1])
    expect(retriedPayload.state.profiles.default.history).toHaveLength(25)
    expect(warningListener).toHaveBeenCalledTimes(1)
    expect((warningListener.mock.calls[0][0] as CustomEvent<{ message: string }>).detail.message).toBe(
      STORAGE_WARNING_MESSAGE,
    )

    window.removeEventListener('pixel-formula-roller:storage-warning', warningListener)
    setItemSpy.mockRestore()
  })

  it('migrates legacy flat formulas and history into the Default profile', async () => {
    const migrate = useAppStore.persist.getOptions().migrate

    const migrated = await migrate?.(
      {
        savedFormulas: [
          {
            id: 'formula-1',
            name: 'Attack',
            formula: '1d20+5',
            createdAt: 10,
            updatedAt: 20,
          },
        ],
        rollHistory: [baseHistoryEntry('1')],
        settings: { theme: 'dark' },
        pairedPixelIds: ['pixel-1'],
      },
      3,
    )

    expect(migrated?.activeProfileId).toBe('default')
    expect(migrated?.profiles?.default?.formulas).toHaveLength(1)
    expect(migrated?.profiles?.default?.history).toHaveLength(1)
    expect(migrated?.savedFormulas).toHaveLength(1)
    expect(migrated?.rollHistory).toHaveLength(1)
    expect(migrated?.pairedPixelIds).toEqual(['pixel-1'])
  })

  it('creates, renames, selects, and deletes profiles without removing the last one', () => {
    const createdId = useAppStore.getState().createProfile('Campaign A')

    expect(createdId).not.toBeNull()
    expect(useAppStore.getState().activeProfileId).toBe(createdId)
    expect(useAppStore.getState().profiles[createdId!].name).toBe('Campaign A')

    useAppStore.getState().addSavedFormula({
      id: 'formula-1',
      name: 'Attack',
      formula: '1d20+5',
      createdAt: 1,
      updatedAt: 1,
    })

    expect(useAppStore.getState().profiles[createdId!].formulas).toHaveLength(1)

    expect(useAppStore.getState().renameProfile(createdId!, 'Campaign B')).toBe(true)
    expect(useAppStore.getState().profiles[createdId!].name).toBe('Campaign B')

    expect(useAppStore.getState().selectProfile('default')).toBe(true)
    expect(useAppStore.getState().activeProfileId).toBe('default')

    expect(useAppStore.getState().deleteProfile(createdId!)).toBe(true)
    expect(useAppStore.getState().profiles[createdId!]).toBeUndefined()

    expect(useAppStore.getState().deleteProfile('default')).toBe(false)
  })

  it('records roll history in the active profile only', () => {
    const createdId = useAppStore.getState().createProfile('Solo Practice')
    expect(createdId).not.toBeNull()

    useAppStore.getState().addRollHistory(baseHistoryEntry('active'))
    expect(useAppStore.getState().profiles[createdId!].history).toHaveLength(1)
    expect(useAppStore.getState().profiles.default.history).toHaveLength(0)
  })
})
