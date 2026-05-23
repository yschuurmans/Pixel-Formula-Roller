import type { DieType, GroupResult } from '../types/formula'
import type { RollHistoryEntry } from '../types/profile'

// When a d100 (tens) and d10 (ones) both show 0, the percentile result is 100, not 0.
function computeTotal(resultGroups: GroupResult[]): number {
  const raw = resultGroups.reduce(
    (sum, g) => sum + g.rolls.reduce((s, r) => s + r.face, 0),
    0,
  )

  const d100Group = resultGroups.find((g) => g.dieType === 'd100')
  const d10Group = resultGroups.find((g) => g.dieType === 'd10')
  if (!d100Group || !d10Group) return raw

  const zeroPairs = Math.min(
    d100Group.rolls.filter((r) => r.face === 0).length,
    d10Group.rolls.filter((r) => r.face === 0).length,
  )

  return raw + zeroPairs * 100
}

export function createDiagnosticHistoryEntry(
  pixelId: string,
  face: number,
  dieType: DieType,
  rolledAt: number,
) {
  const formulaString = `1${dieType}`

  return {
    id: `${pixelId}-${rolledAt}`,
    formulaName: '',
    formulaString,
    total: face,
    rolledAt,
    result: {
      groups: [
        {
          dieType,
          rolls: [{ dieType, face, kept: true as const, source: 'ble' as const }],
        },
      ],
      flatModifier: 0,
      total: face,
    },
    parsedFormula: {
      groups: [{ dieType, count: 1 }],
      flatModifier: 0,
      expression: formulaString,
      raw: formulaString,
      canonical: formulaString,
    },
  }
}

export function mergeRollIntoEntry(
  existing: RollHistoryEntry,
  face: number,
  dieType: DieType,
): RollHistoryEntry {
  const newRoll = { dieType, face, kept: true as const, source: 'ble' as const }

  const resultGroups = existing.result.groups.some((g) => g.dieType === dieType)
    ? existing.result.groups.map((g) =>
        g.dieType === dieType ? { ...g, rolls: [...g.rolls, newRoll] } : g
      )
    : [...existing.result.groups, { dieType, rolls: [newRoll] }]

  const parsedGroups = existing.parsedFormula.groups.some((g) => g.dieType === dieType)
    ? existing.parsedFormula.groups.map((g) =>
        g.dieType === dieType ? { ...g, count: g.count + 1 } : g
      )
    : [...existing.parsedFormula.groups, { dieType, count: 1 }]

  const newTotal = computeTotal(resultGroups)
  const formulaString = parsedGroups.map((g) => `${g.count}${g.dieType}`).join('+')

  return {
    ...existing,
    total: newTotal,
    formulaString,
    result: { ...existing.result, groups: resultGroups, total: newTotal },
    parsedFormula: {
      ...existing.parsedFormula,
      groups: parsedGroups,
      expression: formulaString,
      raw: formulaString,
      canonical: formulaString,
    },
  }
}
