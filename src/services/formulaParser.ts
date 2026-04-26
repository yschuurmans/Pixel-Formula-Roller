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
  // Normalise: trim whitespace, replace d% with 1d100, insert implicit 1 before bare dN
  const normalised = formula
    .trim()
    .replace(/d%/gi, 'd100')
    // Insert "1" before a bare "d" that isn't already preceded by a digit
    // e.g. "d6" → "1d6", "+d8" → "+1d8", but "2d6" is unchanged
    // Capture the non-digit prefix (or start-of-string) to preserve it
    .replace(/(^|[^0-9])d(\d+)/g, '$11d$2');

  if (!normalised) return null;

  // Validate with rpg-dice-roller (parsing only — we throw away the roll result values)
  let diceRoll: DiceRoll;
  try {
    diceRoll = new DiceRoll(normalised);
  } catch {
    return null;
  }

  // The canonical string is the notation stored inside the DiceRoll object.
  // rpg-dice-roller stores the input notation as-is (it does not reformat it).
  const canonical = diceRoll.notation;

  // Extract groups and flat modifier from the canonical notation string.
  // Supported patterns:
  //   <count>d<sides>                  e.g. "2d6", "1d20"
  //   <count>d<sides>kh<n>             e.g. "2d20kh1"
  //   <count>d<sides>kl<n>             e.g. "3d6kl1"
  //   <count>d%                        (already normalised to 1d100 above)
  //   [+-]<number>                     flat modifier
  //
  // We scan the normalised notation left-to-right.
  // Note: the leading token has no explicit '+' sign.

  const groups: DiceGroup[] = [];
  let flatModifier = 0;

  // Tokenise: each token is either a dice group or a flat number, separated by operators
  // Pattern captures: (sign)(count)d(sides)(optional keep mode)(optional keep n)
  //               or: (sign)(flat number)
  const TOKEN_RE = /([+-]?)\s*(\d+)d(\d+|%)(kh|kl)?(\d+)?|([+-]?\s*\d+)(?!\s*d)/gi;

  let match: RegExpExecArray | null;

  // Reset lastIndex for safety
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(canonical)) !== null) {
    // Groups: [full, diceSign, countStr, sidesStr, keepMode, keepNStr, flatStr]
    const countStr = match[2];
    const sidesStr = match[3];
    const keepMode = match[4];
    const keepNStr = match[5];
    const flatStr = match[6];

    if (countStr !== undefined && sidesStr !== undefined) {
      // Dice group token
      const sidesValue = sidesStr === '%' ? '%' : parseInt(sidesStr, 10);
      const dieType = sidesToDieType(sidesValue);

      if (!dieType) {
        // Unsupported die type (e.g. d3, d7) — reject the formula
        return null;
      }

      const count = parseInt(countStr, 10);
      const group: DiceGroup = { dieType, count };

      if (keepMode && keepNStr) {
        group.keep = {
          mode: keepMode as 'kh' | 'kl',
          n: parseInt(keepNStr, 10),
        };
      }

      groups.push(group);
    } else if (flatStr !== undefined) {
      // Flat modifier token
      const num = parseInt(flatStr.replace(/\s/g, ''), 10);
      if (!isNaN(num)) {
        flatModifier += num;
      }
    }
  }

  // Must have at least one dice group to be a valid dice formula
  if (groups.length === 0) return null;

  // Validate complexity limits
  let totalDice = 0;
  for (const group of groups) {
    if (group.count > MAX_DICE_PER_GROUP) return null; // max 20 dice per group
    totalDice += group.count;
  }
  if (totalDice > MAX_TOTAL_DICE) return null; // max 100 total dice
  if (Math.abs(flatModifier) > MAX_MODIFIER) return null; // modifier ±9999

  return {
    groups,
    flatModifier,
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
  let total = parsed.flatModifier;

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

    // Add kept faces to the running total
    for (const roll of resultRolls) {
      if (roll.kept) total += roll.face;
    }

    groupResults.push({ dieType: group.dieType, rolls: resultRolls });
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
