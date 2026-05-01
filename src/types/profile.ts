import type { EvaluationResult, ParsedFormula } from './formula';

export interface SavedFormula {
  id: string;
  name: string;
  formula: string;
  createdAt: number;
  updatedAt: number;
}

export interface RollHistoryEntry {
  id: string;
  formulaName: string;
  formulaString: string;
  total: number;
  rolledAt: number;
  result: EvaluationResult;
  parsedFormula: ParsedFormula;
}

export interface ProfileSkill {
  id: string;
  label: string;
  modifier: number;
  column?: 'left' | 'right';
}

export interface Profile {
  id: string;
  name: string;
  isCharacter: boolean;
  skills: ProfileSkill[];
  formulas: SavedFormula[];
  history: RollHistoryEntry[];
  createdAt: number;
  updatedAt: number;
}