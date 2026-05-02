import type { DieType, DieRollResult, EvaluationResult } from '../types/formula'
import { extractRequiredDice, parseFormula, formulaToPickerState } from '../services/formulaParser'
import { createRollSlotId, createLogicalRollId, combinePercentFaces, pickRandomPixels } from '../pages/formulaHelpers'
import type { RollSlot } from '../pages/availabilityHelpers'

export type CombinedRollMode = 'normal' | 'doubleDice' | 'doubleAll'
export type SavedFormulaRollMode = 'normal' | 'doubleDice' | 'doubleAll'

export type KeepMode = 'kh' | 'kl'

export type FormulaBuilderState = {
  dice: Record<DieType, { count: number; keepMode: KeepMode; keepN: string }>
  flatModifier: number
}

const DIE_ORDER: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

export function createEmptyBuilderState(): FormulaBuilderState {
  return {
    dice: {
      d4: { count: 0, keepMode: 'kh', keepN: '' },
      d6: { count: 0, keepMode: 'kh', keepN: '' },
      d8: { count: 0, keepMode: 'kh', keepN: '' },
      d10: { count: 0, keepMode: 'kh', keepN: '' },
      d12: { count: 0, keepMode: 'kh', keepN: '' },
      d20: { count: 0, keepMode: 'kh', keepN: '' },
      d100: { count: 0, keepMode: 'kh', keepN: '' },
    },
    flatModifier: 0,
  }
}

export function builderStateFromFormula(formula: string): FormulaBuilderState {
  const pickerState = formulaToPickerState(formula)
  const nextState = createEmptyBuilderState()

  if (!pickerState) {
    return nextState
  }

  for (const dieType of DIE_ORDER) {
    const entry = pickerState.dice[dieType]
    if (!entry) continue

    nextState.dice[dieType] = {
      count: entry.count,
      keepMode: entry.keep?.mode ?? 'kh',
      keepN: entry.count >= 2 && entry.keep ? String(entry.keep.n) : '',
    }
  }

  nextState.flatModifier = pickerState.flatModifier
  return nextState
}

export function buildFormulaFromState(state: FormulaBuilderState): string {
  const parts: string[] = []

  for (const dieType of DIE_ORDER) {
    const entry = state.dice[dieType]
    if (entry.count === 0) continue

    let part = `${entry.count}${dieType}`
    if (entry.count >= 2 && entry.keepN !== '') {
      part += `${entry.keepMode}${entry.keepN}`
    }

    parts.push(part)
  }

  let formula = parts.join('+')

  if (state.flatModifier !== 0) {
    if (!formula) {
      formula = String(state.flatModifier)
    } else if (state.flatModifier > 0) {
      formula = `${formula}+${state.flatModifier}`
    } else {
      formula = `${formula}${state.flatModifier}`
    }
  }

  return formula
}

export function buildCombinedFormula(formulas: string[]): string | null {
  const combined = formulas
    .map((formula) => formula.trim())
    .filter((formula) => formula !== '')
    .join('+')

  return combined === '' ? null : combined
}

function serializeParsedFormula(formula: string, mode: CombinedRollMode): string | null {
  const parsed = parseFormula(formula)
  if (!parsed) {
    return null
  }

  const parts = parsed.groups.map((group) => {
    const count = mode === 'normal' ? group.count : group.count * 2
    const keep = group.keep ? `${group.keep.mode}${group.keep.n}` : ''
    return `${count}${group.dieType}${keep}`
  })

  const flatModifier = mode === 'doubleAll' ? parsed.flatModifier * 2 : parsed.flatModifier
  let transformed = parts.join('+')

  if (flatModifier !== 0) {
    transformed = transformed ? `${transformed}${flatModifier > 0 ? '+' : ''}${flatModifier}` : String(flatModifier)
  }

  return transformed
}

export function transformCombinedFormula(formula: string, mode: CombinedRollMode): string | null {
  return serializeParsedFormula(formula, mode)
}

function formatParsedFormulaBase(parsed: ReturnType<typeof parseFormula>): string {
  if (!parsed) {
    return ''
  }

  const parts = parsed.groups.map((group) => {
    const keep = group.keep ? `${group.keep.mode}${group.keep.n}` : ''
    return `${group.count}${group.dieType}${keep}`
  })

  let baseFormula = parts.join('+')

  if (parsed.flatModifier !== 0) {
    if (!baseFormula) {
      baseFormula = String(parsed.flatModifier)
    } else if (parsed.flatModifier > 0) {
      baseFormula = `${baseFormula}+${parsed.flatModifier}`
    } else {
      baseFormula = `${baseFormula}${parsed.flatModifier}`
    }
  }

  return baseFormula
}

export function transformSavedFormulaRoll(formula: string, mode: SavedFormulaRollMode): string | null {
  const parsed = parseFormula(formula)
  if (!parsed) {
    return null
  }

  const baseFormula = formatParsedFormulaBase(parsed)

  if (mode === 'normal') {
    return parsed.canonical
  }

  if (mode === 'doubleDice') {
    return serializeParsedFormula(baseFormula, 'doubleDice')
  }

  return `(${baseFormula})*2`
}

export function normalizeFormulaState(formula: string): { builderState: FormulaBuilderState; formulaText: string } | null {
  const parsed = parseFormula(formula)
  if (!parsed) return null

  const builderState = builderStateFromFormula(parsed.canonical)
  return {
    builderState,
    formulaText: buildFormulaFromState(builderState),
  }
}

export function getKeepError(count: number, keepN: string): string | null {
  if (count < 2 || keepN === '') return null

  const keepValue = Number(keepN)
  if (keepValue > count) return `Cannot keep ${keepValue} of ${count} dice`

  return null
}

export function buildRollSlots(formula: string, connectedPixels: { pixelId: string; dieType: DieType }[]): RollSlot[] {
  const requiredDice = extractRequiredDice(formula)
  const slots: RollSlot[] = []

  for (const [groupIndex, requiredDie] of requiredDice.entries()) {
    if (requiredDie.dieType === 'd100') {
      const matchingTensPixels = connectedPixels.filter((pixel) => pixel.dieType === 'd100')
      const matchingOnesPixels = connectedPixels.filter((pixel) => pixel.dieType === 'd10')
      const promptedTensPixels = matchingTensPixels.length <= 1 ? matchingTensPixels : pickRandomPixels(matchingTensPixels, Math.min(requiredDie.count, matchingTensPixels.length))
      const promptedOnesPixels = matchingOnesPixels.length <= 1 ? matchingOnesPixels : pickRandomPixels(matchingOnesPixels, Math.min(requiredDie.count, matchingOnesPixels.length))
      const isSequentialTens = matchingTensPixels.length === 1 && requiredDie.count > 1
      const isSequentialOnes = matchingOnesPixels.length === 1 && requiredDie.count > 1

      for (let index = 0; index < requiredDie.count; index += 1) {
        const sequence = index + 1
        const logicalId = createLogicalRollId(groupIndex, sequence)
        const assignedTensPixel = matchingTensPixels.length === 0 ? null : matchingTensPixels.length === 1 ? matchingTensPixels[0] : promptedTensPixels[index] ?? null
        const assignedOnesPixel = matchingOnesPixels.length === 0 ? null : matchingOnesPixels.length === 1 ? matchingOnesPixels[0] : promptedOnesPixels[index] ?? null

        slots.push({
          id: createRollSlotId('d100', groupIndex, sequence, 'tens'),
          logicalId,
          dieType: 'd100',
          logicalDieType: 'd100',
          logicalSequence: sequence,
          percentRole: 'tens',
          sequence,
          source: matchingTensPixels.length > 0 ? 'ble' : 'manual',
          pixelId: assignedTensPixel?.pixelId ?? null,
          face: null,
          resultSource: null,
          sequentialTotal: isSequentialTens ? requiredDie.count : null,
        })

        slots.push({
          id: createRollSlotId('d100', groupIndex, sequence, 'ones'),
          logicalId,
          dieType: 'd10',
          logicalDieType: 'd100',
          logicalSequence: sequence,
          percentRole: 'ones',
          sequence,
          source: matchingOnesPixels.length > 0 ? 'ble' : 'manual',
          pixelId: assignedOnesPixel?.pixelId ?? null,
          face: null,
          resultSource: null,
          sequentialTotal: isSequentialOnes ? requiredDie.count : null,
        })
      }

      continue
    }

    const matchingPixels = connectedPixels.filter((pixel) => pixel.dieType === requiredDie.dieType)
    const isSequential = matchingPixels.length === 1 && requiredDie.count > 1
    const promptedPixels = matchingPixels.length <= 1 ? matchingPixels : pickRandomPixels(matchingPixels, Math.min(requiredDie.count, matchingPixels.length))

    for (let index = 0; index < requiredDie.count; index += 1) {
      const sequence = index + 1
      const logicalId = createLogicalRollId(groupIndex, sequence)
      const assignedPixel = matchingPixels.length === 0 ? null : matchingPixels.length === 1 ? matchingPixels[0] : promptedPixels[index] ?? null

      slots.push({
        id: createRollSlotId(requiredDie.dieType, groupIndex, sequence),
        logicalId,
        dieType: requiredDie.dieType,
        logicalDieType: requiredDie.dieType,
        logicalSequence: sequence,
        percentRole: null,
        sequence,
        source: matchingPixels.length > 0 ? 'ble' : 'manual',
        pixelId: assignedPixel?.pixelId ?? null,
        face: null,
        resultSource: null,
        sequentialTotal: isSequential ? requiredDie.count : null,
      })
    }
  }

  return slots
}

export function toEvaluatedRolls(slots: RollSlot[]): DieRollResult[] {
  const rolls: DieRollResult[] = []
  const seenLogicalIds = new Set<string>()

  for (const slot of slots) {
    if (seenLogicalIds.has(slot.logicalId)) continue

    if (slot.logicalDieType === 'd100') {
      const tensSlot = slot.percentRole === 'tens' ? slot : slots.find((candidate) => candidate.logicalId === slot.logicalId && candidate.percentRole === 'tens')
      const onesSlot = slot.percentRole === 'ones' ? slot : slots.find((candidate) => candidate.logicalId === slot.logicalId && candidate.percentRole === 'ones')

      rolls.push({
        dieType: 'd100',
        face: combinePercentFaces(tensSlot?.face ?? null, onesSlot?.face ?? null) ?? 0,
        kept: true,
        source: tensSlot?.resultSource === 'manual' || onesSlot?.resultSource === 'manual' || tensSlot?.source === 'manual' || onesSlot?.source === 'manual' ? 'manual' : 'ble',
      })
      seenLogicalIds.add(slot.logicalId)
      continue
    }

    rolls.push({
      dieType: slot.logicalDieType,
      face: slot.face ?? 0,
      kept: true,
      source: slot.resultSource ?? slot.source,
    })
    seenLogicalIds.add(slot.logicalId)
  }

  return rolls
}

export function toDisplayedRolls(slots: RollSlot[], result: EvaluationResult | null): Array<{
  id: string
  dieType: DieType
  sequence: number
  face: number | null
  pending: boolean
  dropped: boolean
}> {
  const displayedRolls: Array<{ id: string; dieType: DieType; sequence: number; face: number | null; pending: boolean; dropped: boolean }> = []
  const seenLogicalIds = new Set<string>()

  for (const slot of slots) {
    if (seenLogicalIds.has(slot.logicalId)) continue

    if (slot.logicalDieType === 'd100') {
      const tensSlot = slot.percentRole === 'tens' ? slot : slots.find((candidate) => candidate.logicalId === slot.logicalId && candidate.percentRole === 'tens')
      const onesSlot = slot.percentRole === 'ones' ? slot : slots.find((candidate) => candidate.logicalId === slot.logicalId && candidate.percentRole === 'ones')

      displayedRolls.push({
        id: slot.logicalId,
        dieType: 'd100',
        sequence: slot.logicalSequence,
        face: combinePercentFaces(tensSlot?.face ?? null, onesSlot?.face ?? null),
        pending: tensSlot?.face === null || onesSlot?.face === null,
        dropped: false,
      })
      seenLogicalIds.add(slot.logicalId)
      continue
    }

    displayedRolls.push({
      id: slot.id,
      dieType: slot.logicalDieType,
      sequence: slot.logicalSequence,
      face: slot.face,
      pending: slot.face === null,
      dropped: false,
    })
    seenLogicalIds.add(slot.logicalId)
  }

  if (!result) return displayedRolls

  const evaluatedRolls = result.groups.flatMap((group) => group.rolls)

  return displayedRolls.map((roll, index) => {
    const evaluatedRoll = evaluatedRolls[index]
    return {
      ...roll,
      face: roll.face ?? evaluatedRoll?.face ?? null,
      pending: roll.pending,
      dropped: evaluatedRoll ? !evaluatedRoll.kept : false,
    }
  })
}
