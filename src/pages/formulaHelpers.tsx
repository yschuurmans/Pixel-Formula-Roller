import { parseFormula, formulaToPickerState, extractRequiredDice } from '../services/formulaParser'
import type { DieType, ParsedFormula, EvaluationResult } from '../types/formula'

export function displayDieType(dieType: DieType): string {
  return dieType === 'd100' ? 'd%' : dieType
}

export function getDieFaces(dieType: DieType): number {
  switch (dieType) {
    case 'd4':
      return 4
    case 'd6':
      return 6
    case 'd8':
      return 8
    case 'd10':
      return 10
    case 'd12':
      return 12
    case 'd20':
      return 20
    case 'd100':
      return 100
  }
}

export function createRollSlotId(dieType: DieType, groupIndex: number, sequence: number, percentRole?: string): string {
  return percentRole === undefined
    ? `${dieType}-${groupIndex}-${sequence}`
    : `${dieType}-${groupIndex}-${sequence}-${percentRole}`
}

export function createLogicalRollId(groupIndex: number, sequence: number): string {
  return `${groupIndex}-${sequence}`
}

export function getPercentOnesValue(face: number): number {
  return face === 10 ? 0 : face
}

export function getPercentTensValue(face: number): number {
  if (face >= 1 && face <= 91 && face % 10 === 1) {
    return face - 1
  }

  return face
}

export function combinePercentFaces(tensFace: number | null, onesFace: number | null): number | null {
  if (tensFace === null || onesFace === null) {
    return null
  }

  const total = getPercentTensValue(tensFace) + getPercentOnesValue(onesFace)
  return total === 0 ? 100 : total
}

export function getManualEntryConfig(slot: { logicalDieType: DieType; percentRole: string | null; dieType: DieType }) {
  if (slot.logicalDieType === 'd100' && slot.percentRole === 'tens') {
    return {
      min: 0,
      max: 90,
      step: 10,
      error: 'Enter a value from 0 to 90 in steps of 10',
    }
  }

  if (slot.logicalDieType === 'd100' && slot.percentRole === 'ones') {
    return {
      min: 0,
      max: 9,
      step: 1,
      error: 'Enter a value from 0 to 9',
    }
  }

  return {
    min: 1,
    max: getDieFaces(slot.dieType),
    step: 1,
    error: `Enter a value from 1 to ${getDieFaces(slot.dieType)}`,
  }
}

export function getManualEntryLabel(slot: { logicalDieType: DieType; percentRole: string | null; logicalSequence: number }) {
  if (slot.logicalDieType === 'd100' && slot.percentRole === 'tens') {
    return `d% #${slot.logicalSequence} tens`
  }

  if (slot.logicalDieType === 'd100' && slot.percentRole === 'ones') {
    return `d% #${slot.logicalSequence} ones`
  }

  return `${displayDieType(slot.logicalDieType)} #${slot.logicalSequence}`
}

export function pickRandomPixels<T>(pixels: T[], count: number): T[] {
  if (count >= pixels.length) {
    return pixels
  }

  const shuffledPixels = [...pixels]
  for (let index = shuffledPixels.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffledPixels[index], shuffledPixels[swapIndex]] = [shuffledPixels[swapIndex], shuffledPixels[index]]
  }

  return shuffledPixels.slice(0, count)
}

export function createFormulaId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `formula-${Date.now()}`
}

export function createRollHistoryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `history-${Date.now()}`
}

export function createRollSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `rollsession-${Date.now()}`
}

export function createRollHistoryEntry(formulaName: string, parsedFormula: ParsedFormula, result: EvaluationResult) {
  return {
    id: createRollHistoryId(),
    formulaName,
    formulaString: parsedFormula.canonical,
    total: result.total,
    rolledAt: Date.now(),
    result,
    parsedFormula,
  }
}

export function AutoHideCountdown({ remainingMs, durationMs }: { remainingMs: number; durationMs: number }) {
  const secondsRemaining = Math.ceil(remainingMs / 1000)
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const progress = remainingMs / durationMs
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div
      aria-label={`Roll screen closes in ${secondsRemaining} seconds`}
      className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#4f94ff] bg-[#0b1324] shadow-[4px_4px_0_0_#07101f]"
      title={`Auto closes in ${secondsRemaining} seconds`}
    >
      <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="#1f3257" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="#86efac"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[10px] text-[#d7ffe5]">{secondsRemaining}</span>
    </div>
  )
}

export { parseFormula, formulaToPickerState, extractRequiredDice }
