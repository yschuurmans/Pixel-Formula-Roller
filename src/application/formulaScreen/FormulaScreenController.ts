import type { RememberedPixelEntry, SavedFormula } from '../../stores/useAppStore'
import type { DieType, EvaluationResult, ParsedFormula } from '../../types/formula'
import { buildRollSlots, createEmptyBuilderState, getKeepError, normalizeFormulaState, toDisplayedRolls, type FormulaBuilderState, type KeepMode } from '../rollHelpers'
import { getGlowPixelIdsForSlots, promoteRecoverableManualSlots, type ConnectedPixel, type RollSlot } from '../../pages/availabilityHelpers'
import { getManualEntryConfig } from '../../pages/formulaHelpers'

export type FormulaScreenMode = 'builder' | 'roll-only'

export type NavigationIntent = {
  message: string
  replace?: boolean
}

export type FormulaScreenLocationState = {
  focusRollEngine?: boolean
}

export type SnapshotState = {
  name: string
  formulaText: string
}

export type RollSession = {
  parsedFormula: ParsedFormula
  slots: RollSlot[]
  result: EvaluationResult | null
  statusMessage: string | null
  historyRecorded: boolean
  sessionId?: string
}

export type DisplayedRollEntry = {
  id: string
  dieType: DieType
  sequence: number
  face: number | null
  pending: boolean
  dropped: boolean
}

export type DisplayedRollGroup = {
  dieType: DieType
  rolls: DisplayedRollEntry[]
}

const DIE_ORDER: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

export class FormulaScreenController {
  getExistingFormula(savedFormulas: SavedFormula[], formulaId?: string): SavedFormula | null {
    if (!formulaId) {
      return null
    }

    return savedFormulas.find((formula) => formula.id === formulaId) ?? null
  }

  buildInitialState(existingFormula: SavedFormula | null, isEditing: boolean, isRollOnly: boolean): {
    initialSnapshot: SnapshotState
    builderState: FormulaBuilderState
    formulaText: string
    navigationIntent: NavigationIntent | null
    isReady: boolean
  } {
    if (isRollOnly) {
      if (!existingFormula) {
        return {
          initialSnapshot: { name: '', formulaText: '' },
          builderState: createEmptyBuilderState(),
          formulaText: '',
          navigationIntent: { message: 'Formula not found', replace: true },
          isReady: false,
        }
      }

      const normalized = normalizeFormulaState(existingFormula.formula)
      const builderState = normalized?.builderState ?? createEmptyBuilderState()
      const formulaText = normalized?.formulaText ?? existingFormula.formula

      return {
        initialSnapshot: { name: existingFormula.name, formulaText },
        builderState,
        formulaText,
        navigationIntent: null,
        isReady: true,
      }
    }

    if (!isEditing) {
      return {
        initialSnapshot: { name: '', formulaText: '' },
        builderState: createEmptyBuilderState(),
        formulaText: '',
        navigationIntent: null,
        isReady: true,
      }
    }

    if (!existingFormula) {
      return {
        initialSnapshot: { name: '', formulaText: '' },
        builderState: createEmptyBuilderState(),
        formulaText: '',
        navigationIntent: { message: 'Formula not found', replace: true },
        isReady: false,
      }
    }

    const normalized = normalizeFormulaState(existingFormula.formula)
    const builderState = normalized?.builderState ?? createEmptyBuilderState()
    const formulaText = normalized?.formulaText ?? existingFormula.formula

    return {
      initialSnapshot: { name: existingFormula.name, formulaText },
      builderState,
      formulaText,
      navigationIntent: null,
      isReady: true,
    }
  }

  getKeepErrors(builderState: FormulaBuilderState): Partial<Record<DieType, string>> {
    const errors: Partial<Record<DieType, string>> = {}

    for (const dieType of DIE_ORDER) {
      const entry = builderState.dice[dieType]
      const error = getKeepError(entry.count, entry.keepN)
      if (error) {
        errors[dieType] = error
      }
    }

    return errors
  }

  getKeepDice(builderState: FormulaBuilderState): DieType[] {
    return DIE_ORDER.filter((dieType) => builderState.dice[dieType].count >= 2)
  }

  getConnectedPixels(
    pixels: Record<string, { pixelId: string; dieType: DieType; connectionState: string }>,
  ): ConnectedPixel[] {
    return Object.values(pixels)
      .filter((pixel) => pixel.connectionState === 'connected')
      .map((pixel) => ({ pixelId: pixel.pixelId, dieType: pixel.dieType }))
      .sort((left, right) => left.pixelId.localeCompare(right.pixelId))
  }

  getCurrentSequentialSlot(rollSession: RollSession | null): RollSlot | null {
    if (!rollSession || rollSession.result) {
      return null
    }

    return rollSession.slots.find((slot) => slot.face === null && slot.source === 'ble' && slot.sequentialTotal !== null) ?? null
  }

  getDisplayedRollsByDieType(rollSession: RollSession | null): DisplayedRollGroup[] {
    if (!rollSession) {
      return []
    }

    const groups = new Map<DieType, DisplayedRollEntry[]>()
    for (const roll of toDisplayedRolls(rollSession.slots, rollSession.result)) {
      const existing = groups.get(roll.dieType) ?? []
      existing.push(roll)
      groups.set(roll.dieType, existing)
    }

    return DIE_ORDER
      .filter((dieType) => groups.has(dieType))
      .map((dieType) => ({ dieType, rolls: groups.get(dieType)! }))
  }

  getPendingManualSlots(rollSession: RollSession | null): RollSlot[] {
    return rollSession?.slots.filter((slot) => slot.face === null && slot.source === 'manual') ?? []
  }

  getManualInputErrors(pendingManualSlots: RollSlot[], manualInputs: Record<string, string>): Record<string, string> {
    const errors: Record<string, string> = {}

    for (const slot of pendingManualSlots) {
      const value = manualInputs[slot.id] ?? ''
      if (value === '') {
        continue
      }

      const entryConfig = getManualEntryConfig(slot)
      const parsedValue = Number(value)
      if (
        !Number.isInteger(parsedValue) ||
        parsedValue < entryConfig.min ||
        parsedValue > entryConfig.max ||
        (parsedValue - entryConfig.min) % entryConfig.step !== 0
      ) {
        errors[slot.id] = entryConfig.error
      }
    }

    return errors
  }

  isManualSubmitDisabled(
    pendingManualSlots: RollSlot[],
    manualInputs: Record<string, string>,
    manualInputErrors: Record<string, string>,
  ): boolean {
    return (
      pendingManualSlots.length === 0 ||
      pendingManualSlots.some((slot) => (manualInputs[slot.id] ?? '') === '' || manualInputErrors[slot.id] !== undefined)
    )
  }

  updateCount(builderState: FormulaBuilderState, dieType: DieType, delta: number): FormulaBuilderState {
    const current = builderState.dice[dieType]
    const nextCount = Math.max(0, current.count + delta)

    return {
      ...builderState,
      dice: {
        ...builderState.dice,
        [dieType]: {
          ...current,
          count: nextCount,
          keepN: nextCount < 2 ? '' : current.keepN,
        },
      },
    }
  }

  updateKeepMode(builderState: FormulaBuilderState, dieType: DieType, mode: KeepMode): FormulaBuilderState {
    const current = builderState.dice[dieType]

    return {
      ...builderState,
      dice: {
        ...builderState.dice,
        [dieType]: {
          ...current,
          keepMode: mode,
        },
      },
    }
  }

  updateKeepValue(builderState: FormulaBuilderState, dieType: DieType, value: string): FormulaBuilderState {
    const current = builderState.dice[dieType]
    let sanitized = value.replace(/\D/g, '')

    if (sanitized !== '' && Number(sanitized) < 1) {
      sanitized = '1'
    }

    return {
      ...builderState,
      dice: {
        ...builderState.dice,
        [dieType]: {
          ...current,
          keepN: sanitized,
        },
      },
    }
  }

  applyKeepPreset(builderState: FormulaBuilderState, dieType: DieType, mode: KeepMode): FormulaBuilderState {
    const current = builderState.dice[dieType]

    return {
      ...builderState,
      dice: {
        ...builderState.dice,
        [dieType]: {
          ...current,
          count: 2,
          keepMode: mode,
          keepN: '1',
        },
      },
    }
  }

  updateFlatModifier(builderState: FormulaBuilderState, value: string): FormulaBuilderState | null {
    const parsedValue = value === '' ? 0 : Number(value)
    if (!Number.isFinite(parsedValue)) {
      return null
    }

    return {
      ...builderState,
      flatModifier: Math.min(9999, Math.max(-9999, Math.trunc(parsedValue))),
    }
  }

  buildPendingRollSession(
    formulaText: string,
    parsedFormula: ParsedFormula,
    connectedPixels: ConnectedPixel[],
    pairedPixels: Record<string, RememberedPixelEntry>,
    sessionId: string,
  ): { session: RollSession; pixelIdsToGlow: string[] } {
    const slots = promoteRecoverableManualSlots(buildRollSlots(formulaText, connectedPixels), pairedPixels)
    const pixelIdsToGlow = getGlowPixelIdsForSlots(slots, connectedPixels)

    return {
      session: {
        parsedFormula,
        slots,
        result: null,
        statusMessage: null,
        historyRecorded: false,
        sessionId,
      },
      pixelIdsToGlow,
    }
  }

  applyManualInputs(rollSession: RollSession, manualInputs: Record<string, string>): RollSession {
    return {
      ...rollSession,
      statusMessage: null,
      slots: rollSession.slots.map((slot) => {
        if (slot.face !== null || slot.source !== 'manual') {
          return slot
        }

        return {
          ...slot,
          face: Number(manualInputs[slot.id]),
          resultSource: 'manual' as const,
        }
      }),
    }
  }
}