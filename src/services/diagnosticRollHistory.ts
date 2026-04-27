import type { DieType } from '../types/formula'

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
      raw: formulaString,
      canonical: formulaString,
    },
  }
}