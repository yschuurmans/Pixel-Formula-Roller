import { evaluateFormula, parseFormula } from './formulaParser';
import type { DieRollResult, DieType, EvaluationResult, ParsedFormula } from '../types/formula';

const DIE_FACE_COUNT: Record<DieType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 100,
};

function rollFace(dieType: DieType): number {
  return Math.floor(Math.random() * DIE_FACE_COUNT[dieType]) + 1;
}

function createRandomRolls(parsedFormula: ParsedFormula): DieRollResult[] {
  return parsedFormula.groups.flatMap((group) =>
    Array.from({ length: group.count }, (): DieRollResult => ({
      dieType: group.dieType,
      face: rollFace(group.dieType),
      kept: true,
      source: 'manual',
    })),
  );
}

export function rollFormula(formula: string): { parsedFormula: ParsedFormula; result: EvaluationResult } | null {
  const parsedFormula = parseFormula(formula);
  if (!parsedFormula) {
    return null;
  }

  return {
    parsedFormula,
    result: evaluateFormula(parsedFormula, createRandomRolls(parsedFormula)),
  };
}