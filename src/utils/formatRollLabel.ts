import type { DieRollResult } from '../types/formula'

export default function formatRollLabel(roll: DieRollResult, index: number): string {
  const dieLabel = roll.dieType === 'd100' ? 'd%' : roll.dieType
  const sequence = index + 1
  const faceLabel = roll.face === null ? '—' : roll.dieType === 'd100' && roll.face < 100 ? String(roll.face).padStart(2, '0') : String(roll.face)
  const keptText = roll.kept ? '✓' : '(dropped)'
  const manualText = roll.source === 'manual' ? ' (manual)' : ''

  return `${dieLabel} #${sequence} → ${faceLabel} ${keptText}${manualText}`
}
