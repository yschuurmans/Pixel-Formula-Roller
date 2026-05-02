/**
 * formulaParser.ts
 *
 * Thin service wrapping rpg-dice-roller for parsing dice formulas.
 * The library is used for PARSING ONLY — its roll engine is never called in evaluateFormula.
 * Keep-high / keep-low evaluation is implemented manually using the supplied rolls array.
 *
 * Design decisions from STORY-000:
 *   - Never call rpg-dice-roller's roll engine inside evaluateFormula.
 *   - d% in input is normalised to 1d100 before parsing.
 *   - canonical = the library's normalised notation string (diceRoll.notation).
 */

import { DiceRoll } from 'rpg-dice-roller';
import type {
  DieType,
  DiceGroup,
  ParsedFormula,
  RequiredDie,
  DieRollResult,
  GroupResult,
  EvaluationResult,
  PickerState,
} from '../types/formula';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DICE_PER_GROUP = 20;
const MAX_TOTAL_DICE = 100;
const MAX_MODIFIER = 9999;

const DIE_ORDER: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
const TOKEN_RE = /(\d+d(?:\d+|%)(?:kh|kl)?\d*|\d+|[()+\-*/])/y;
const DICE_TOKEN_RE = /^\d+d(?:\d+|%)(?:kh|kl)?\d*$/i;

type ParsedToken =
  | { kind: 'dice'; text: string; canonical: string; groupIndex: number }
  | { kind: 'number' | 'operator' | 'paren'; text: string };

/** Map die sides number (or '%') to our DieType token. Returns null for unsupported die types. */
function sidesToDieType(sides: number | string): DieType | null {
  if (sides === '%' || sides === 100) return 'd100';
  const map: Record<number, DieType> = {
    4: 'd4',
    6: 'd6',
    8: 'd8',
    10: 'd10',
    12: 'd12',
    20: 'd20',
  };
  if (typeof sides === 'number' && sides in map) return map[sides];
  return null;
}

function normalizeFormulaInput(formula: string): string {
  return formula
    .trim()
    .replace(/d%/gi, 'd100')
    .replace(/(^|[^0-9])d(\d+)/g, '$11d$2')
    .replace(/\s+/g, '');
}

function tokenizeFormula(formula: string): ParsedToken[] | null {
  const tokens: ParsedToken[] = [];
  let cursor = 0;
  let groupIndex = 0;

  TOKEN_RE.lastIndex = 0;

  while (cursor < formula.length) {
    TOKEN_RE.lastIndex = cursor;
    const match = TOKEN_RE.exec(formula);
    if (!match || match.index !== cursor) {
      return null;
    }

    const text = match[1];
    cursor = TOKEN_RE.lastIndex;

    if (DICE_TOKEN_RE.test(text)) {
      tokens.push({ kind: 'dice', text, canonical: text, groupIndex });
      groupIndex += 1;
      continue;
    }

    if (/^\d+$/.test(text)) {
      tokens.push({ kind: 'number', text });
      continue;
    }

    if (text === '(' || text === ')') {
      tokens.push({ kind: 'paren', text });
      continue;
    }

    tokens.push({ kind: 'operator', text });
  }

  return tokens;
}

function evaluateArithmeticExpression(expression: string): number | null {
  if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
    return null;
  }

  try {
    const evaluated = Function(`"use strict"; return (${expression});`)();
    return typeof evaluated === 'number' && Number.isFinite(evaluated) ? evaluated : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// parseFormula
// ---------------------------------------------------------------------------

/**
 * Parse a dice formula string into a structured ParsedFormula.
 *
 * Returns null if:
 *   - the formula is empty after trimming
 *   - rpg-dice-roller cannot parse it (invalid syntax / unsupported notation)
 *   - any die type is not in our supported set (d4, d6, d8, d10, d12, d20, d100)
 *   - complexity limits are exceeded:
 *       - max 20 dice per group
 *       - max 100 total dice
 *       - modifier clamped to ±9999
 */
export function parseFormula(formula: string): ParsedFormula | null {
  const normalised = normalizeFormulaInput(formula);
  if (!normalised) {
    return null;
  }
  const tokens = tokenizeFormula(normalised);
  if (!tokens || tokens.length === 0) {
    return null;
  }

  const groups: DiceGroup[] = [];
  const expressionParts: string[] = [];
  const canonicalParts: string[] = [];

  let previousToken: ParsedToken | null = null;

  for (const token of tokens) {
    if (token.kind === 'dice') {
      if (previousToken?.kind === 'operator' && previousToken.text === '-') {
        return null;
      }

      const diceRoll = new DiceRoll(token.text);
      const dieToken = diceRoll.notation;
      const diceMatch = dieToken.match(/^(\d+)d(\d+|%)(kh|kl)?(\d+)?$/i);
      if (!diceMatch) {
        return null;
      }

      const sidesValue = diceMatch[2] === '%' ? '%' : parseInt(diceMatch[2], 10);
      const dieType = sidesToDieType(sidesValue);
      if (!dieType) {
        return null;
      }

      const count = parseInt(diceMatch[1], 10);
      const group: DiceGroup = { dieType, count };
      if (diceMatch[3] && diceMatch[4]) {
        group.keep = {
          mode: diceMatch[3] as 'kh' | 'kl',
          n: parseInt(diceMatch[4], 10),
        };
      }

      groups.push(group);
      expressionParts.push(`__g${token.groupIndex}__`);
      canonicalParts.push(dieToken);
      previousToken = token;
      continue;
    }

    expressionParts.push(token.text);
    canonicalParts.push(token.text);
    previousToken = token;
  }

  if (groups.length === 0) {
    return null;
  }

  let totalDice = 0;
  for (const group of groups) {
    if (group.count > MAX_DICE_PER_GROUP) return null;
    totalDice += group.count;
  }
  if (totalDice > MAX_TOTAL_DICE) return null;

  const expression = expressionParts.join('');
  const canonical = canonicalParts.join('');

  let flatModifier = 0;
  const hasMultiplicationOrDivision = tokens.some((token) => token.kind === 'operator' && (token.text === '*' || token.text === '/'));
  if (!hasMultiplicationOrDivision) {
    const constantExpression = expression.replace(/__g\d+__/g, '0');
    const constantValue = evaluateArithmeticExpression(constantExpression);
    if (constantValue === null) {
      return null;
    }
    flatModifier = constantValue;
  }

  if (Math.abs(flatModifier) > MAX_MODIFIER) return null;

  let multiplier: number | undefined;
  const topLevelMultiplierMatch = canonical.match(/^\((.+)\)\*(\d+(?:\.\d+)?)$/);
  if (topLevelMultiplierMatch) {
    const multiplierValue = Number(topLevelMultiplierMatch[2]);
    if (Number.isFinite(multiplierValue) && multiplierValue >= 1) {
      multiplier = multiplierValue;
    }
  }

  return {
    groups,
    flatModifier,
    multiplier,
    expression,
    raw: formula,
    canonical,
  };
}

// ---------------------------------------------------------------------------
// evaluateFormula
// ---------------------------------------------------------------------------

/**
 * Evaluate a parsed formula against a flat array of pre-rolled die results.
 *
 * Rolls are distributed to groups in order:
 *   - first group.count rolls → first group
 *   - next group.count rolls → second group
 *   - etc.
 *
 * Keep-high / keep-low logic is applied manually — rpg-dice-roller's roll engine is NOT used.
 */
export function evaluateFormula(
  parsed: ParsedFormula,
  rolls: DieRollResult[],
): EvaluationResult {
  const groupResults: GroupResult[] = [];
  let rollIndex = 0;
  const groupTotals: number[] = [];

  for (const group of parsed.groups) {
    const groupRolls = rolls.slice(rollIndex, rollIndex + group.count);
    rollIndex += group.count;

    let resultRolls: DieRollResult[];

    if (group.keep) {
      const { mode, n } = group.keep;

      // Sort a copy of the group's rolls by face value
      const sorted = [...groupRolls].sort((a, b) =>
        mode === 'kh' ? b.face - a.face : a.face - b.face,
      );

      // Build a set of the top-n roll objects (by reference) to keep
      const keptRolls = new Set<DieRollResult>(sorted.slice(0, n));

      resultRolls = groupRolls.map((roll) => {
        if (keptRolls.has(roll)) {
          keptRolls.delete(roll); // remove after first match (handles duplicate faces)
          return { ...roll, dieType: group.dieType, kept: true };
        }
        return { ...roll, dieType: group.dieType, kept: false };
      });
    } else {
      // No keep modifier — all rolls are kept
      resultRolls = groupRolls.map((roll) => ({
        ...roll,
        dieType: group.dieType,
        kept: true,
      }));
    }

    let groupTotal = 0;
    for (const roll of resultRolls) {
      if (roll.kept) groupTotal += roll.face;
    }

    groupTotals.push(groupTotal);

    groupResults.push({ dieType: group.dieType, rolls: resultRolls });
  }

  let total: number;
  try {
    const substituted = parsed.expression.replace(/__g(\d+)__/g, (_, index: string) => String(groupTotals[Number(index)] ?? 0));
    const evaluatedTotal = evaluateArithmeticExpression(substituted);
    if (evaluatedTotal === null) {
      return {
        groups: groupResults,
        flatModifier: parsed.flatModifier,
        total: parsed.flatModifier,
      };
    }
    total = evaluatedTotal;
  } catch {
    total = parsed.flatModifier + groupTotals.reduce((sum, groupTotal) => sum + groupTotal, 0);
  }

  return {
    groups: groupResults,
    flatModifier: parsed.flatModifier,
    total,
  };
}

// ---------------------------------------------------------------------------
// extractRequiredDice
// ---------------------------------------------------------------------------

/**
 * Extract the list of required dice from a formula string.
 * Returns an empty array if the formula is invalid.
 */
export function extractRequiredDice(formula: string): RequiredDie[] {
  const parsed = parseFormula(formula);
  if (!parsed) return [];
  return parsed.groups.map((g): RequiredDie => ({
    dieType: g.dieType,
    count: g.count,
    ...(g.keep ? { keep: g.keep } : {}),
  }));
}

// ---------------------------------------------------------------------------
// formulaToPickerState
// ---------------------------------------------------------------------------

/**
 * Convert a formula string to a PickerState.
 * Returns null if the formula cannot be parsed.
 */
export function formulaToPickerState(formula: string): PickerState | null {
  const parsed = parseFormula(formula);
  if (!parsed) return null;

  const dice: PickerState['dice'] = {};
  for (const group of parsed.groups) {
    dice[group.dieType] = {
      count: group.count,
      ...(group.keep ? { keep: group.keep } : {}),
    };
  }

  return { dice, flatModifier: parsed.flatModifier };
}

// ---------------------------------------------------------------------------
// pickerStateToFormula
// ---------------------------------------------------------------------------

/**
 * Convert a PickerState back to a formula string.
 *
 * Die groups are emitted in canonical order: d4, d6, d8, d10, d12, d20, d100.
 * d100 is written as "d100" (never "d%") in the formula string.
 * The flat modifier is appended last if non-zero (e.g. "+3" or "-1").
 */
export function pickerStateToFormula(state: PickerState): string {
  const parts: string[] = [];

  for (const dieType of DIE_ORDER) {
    const entry = state.dice[dieType];
    if (!entry || entry.count === 0) continue;

    const faces = dieType.slice(1); // e.g. "6" from "d6", "100" from "d100"
    let part = `${entry.count}d${faces}`;

    if (entry.keep) {
      part += `${entry.keep.mode}${entry.keep.n}`;
    }

    parts.push(part);
  }

  // Build the result: join dice parts with '+', then append the modifier
  let result = parts.join('+');

  if (state.flatModifier !== 0) {
    if (state.flatModifier > 0) {
      result = result ? `${result}+${state.flatModifier}` : `${state.flatModifier}`;
    } else {
      // negative modifier — the number already includes the '-' sign
      result = result ? `${result}${state.flatModifier}` : `${state.flatModifier}`;
    }
  }

  return result;
}
