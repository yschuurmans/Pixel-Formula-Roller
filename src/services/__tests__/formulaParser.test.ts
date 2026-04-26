/**
 * formulaParser.test.ts
 *
 * Tests for the formulaParser service covering:
 *   - parseFormula: valid cases, invalid cases, limit enforcement
 *   - evaluateFormula: kh/kl keep logic with fixed roll arrays
 *   - formulaToPickerState / pickerStateToFormula: round-trip
 *   - extractRequiredDice: compound formula decomposition
 */

import { describe, it, expect } from 'vitest';
import {
  parseFormula,
  evaluateFormula,
  extractRequiredDice,
  formulaToPickerState,
  pickerStateToFormula,
} from '../formulaParser';
import type { DieRollResult } from '../../types/formula';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal DieRollResult for testing */
function roll(
  face: number,
  dieType: DieRollResult['dieType'] = 'd6',
  source: DieRollResult['source'] = 'manual',
): DieRollResult {
  return { dieType, face, kept: true, source };
}

// ---------------------------------------------------------------------------
// parseFormula
// ---------------------------------------------------------------------------

describe('parseFormula', () => {
  describe('valid cases', () => {
    it('parses "2d6" correctly', () => {
      const result = parseFormula('2d6');
      expect(result).not.toBeNull();
      expect(result!.groups).toHaveLength(1);
      expect(result!.groups[0]).toMatchObject({ dieType: 'd6', count: 2 });
      expect(result!.groups[0].keep).toBeUndefined();
      expect(result!.flatModifier).toBe(0);
    });

    it('parses "1d20+5" correctly', () => {
      const result = parseFormula('1d20+5');
      expect(result).not.toBeNull();
      expect(result!.groups).toHaveLength(1);
      expect(result!.groups[0]).toMatchObject({ dieType: 'd20', count: 1 });
      expect(result!.flatModifier).toBe(5);
    });

    it('parses "2d20kh1" correctly', () => {
      const result = parseFormula('2d20kh1');
      expect(result).not.toBeNull();
      expect(result!.groups).toHaveLength(1);
      expect(result!.groups[0]).toMatchObject({
        dieType: 'd20',
        count: 2,
        keep: { mode: 'kh', n: 1 },
      });
      expect(result!.flatModifier).toBe(0);
    });

    it('parses "2d20kh1+1d8+3d6kl1" into 3 groups with no flat modifier', () => {
      const result = parseFormula('2d20kh1+1d8+3d6kl1');
      expect(result).not.toBeNull();
      expect(result!.groups).toHaveLength(3);
      expect(result!.groups[0]).toMatchObject({
        dieType: 'd20',
        count: 2,
        keep: { mode: 'kh', n: 1 },
      });
      expect(result!.groups[1]).toMatchObject({ dieType: 'd8', count: 1 });
      expect(result!.groups[2]).toMatchObject({
        dieType: 'd6',
        count: 3,
        keep: { mode: 'kl', n: 1 },
      });
      expect(result!.flatModifier).toBe(0);
    });

    it('normalises "d%" to a 1d100 group', () => {
      const result = parseFormula('d%');
      expect(result).not.toBeNull();
      expect(result!.groups).toHaveLength(1);
      expect(result!.groups[0]).toMatchObject({ dieType: 'd100', count: 1 });
    });

    it('stores the original raw formula', () => {
      const result = parseFormula('  2d6  ');
      expect(result).not.toBeNull();
      expect(result!.raw).toBe('  2d6  ');
    });

    it('parses "1d6-2" with negative flat modifier', () => {
      const result = parseFormula('1d6-2');
      expect(result).not.toBeNull();
      expect(result!.flatModifier).toBe(-2);
    });

    it('parses all supported die types', () => {
      const types = ['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '1d100'];
      for (const t of types) {
        expect(parseFormula(t)).not.toBeNull();
      }
    });
  });

  describe('invalid cases', () => {
    it('returns null for empty string', () => {
      expect(parseFormula('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(parseFormula('   ')).toBeNull();
    });

    it('returns null for plain text', () => {
      expect(parseFormula('hello')).toBeNull();
    });

    it('returns null for malformed expression', () => {
      expect(parseFormula('2d')).toBeNull();
    });

    it('returns null for unsupported die type (d3)', () => {
      expect(parseFormula('1d3')).toBeNull();
    });

    it('returns null when a group exceeds 20 dice (21d20)', () => {
      expect(parseFormula('21d20')).toBeNull();
    });

    it('returns null when total dice exceed 100 (101d6)', () => {
      expect(parseFormula('101d6')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// evaluateFormula
// ---------------------------------------------------------------------------

describe('evaluateFormula', () => {
  it('sums all dice for a simple "2d6" formula', () => {
    const parsed = parseFormula('2d6')!;
    const rolls: DieRollResult[] = [
      roll(3, 'd6'),
      roll(5, 'd6'),
    ];
    const result = evaluateFormula(parsed, rolls);
    expect(result.total).toBe(8);
    expect(result.flatModifier).toBe(0);
    expect(result.groups[0].rolls).toHaveLength(2);
    expect(result.groups[0].rolls.every((r) => r.kept)).toBe(true);
  });

  it('applies keep-high for "2d20kh1"', () => {
    const parsed = parseFormula('2d20kh1')!;
    const rolls: DieRollResult[] = [
      roll(15, 'd20'),
      roll(8, 'd20'),
    ];
    const result = evaluateFormula(parsed, rolls);
    // kh1 — keep highest: 15 is kept, 8 is dropped
    expect(result.total).toBe(15);

    const kept = result.groups[0].rolls.filter((r) => r.kept);
    const dropped = result.groups[0].rolls.filter((r) => !r.kept);
    expect(kept).toHaveLength(1);
    expect(kept[0].face).toBe(15);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].face).toBe(8);
  });

  it('applies keep-low for "2d20kl1"', () => {
    const parsed = parseFormula('2d20kl1')!;
    const rolls: DieRollResult[] = [
      roll(15, 'd20'),
      roll(8, 'd20'),
    ];
    const result = evaluateFormula(parsed, rolls);
    // kl1 — keep lowest: 8 is kept, 15 is dropped
    expect(result.total).toBe(8);

    const kept = result.groups[0].rolls.filter((r) => r.kept);
    const dropped = result.groups[0].rolls.filter((r) => !r.kept);
    expect(kept).toHaveLength(1);
    expect(kept[0].face).toBe(8);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].face).toBe(15);
  });

  it('adds flat modifier to total for "1d6+3"', () => {
    const parsed = parseFormula('1d6+3')!;
    const rolls: DieRollResult[] = [roll(4, 'd6')];
    const result = evaluateFormula(parsed, rolls);
    expect(result.total).toBe(7); // 4 + 3
    expect(result.flatModifier).toBe(3);
  });

  it('handles multiple groups correctly', () => {
    const parsed = parseFormula('2d20kh1+1d8+3d6kl1')!;
    const rolls: DieRollResult[] = [
      roll(15, 'd20'), // group 1 (kh1): kept
      roll(8, 'd20'),  // group 1: dropped
      roll(6, 'd8'),   // group 2: kept
      roll(4, 'd6'),   // group 3 (kl1): ?
      roll(2, 'd6'),   // group 3: kept
      roll(5, 'd6'),   // group 3: ?
    ];
    const result = evaluateFormula(parsed, rolls);
    // kh1 from [15,8]: 15
    // all from [6]: 6
    // kl1 from [4,2,5]: keep lowest = 2
    expect(result.total).toBe(15 + 6 + 2);
    expect(result.groups).toHaveLength(3);
  });

  it('subtracts flat modifier when negative', () => {
    const parsed = parseFormula('1d6-2')!;
    const rolls: DieRollResult[] = [roll(4, 'd6')];
    const result = evaluateFormula(parsed, rolls);
    expect(result.total).toBe(2); // 4 - 2
    expect(result.flatModifier).toBe(-2);
  });
});

// ---------------------------------------------------------------------------
// formulaToPickerState / pickerStateToFormula round-trip
// ---------------------------------------------------------------------------

describe('formulaToPickerState / pickerStateToFormula round-trip', () => {
  it('round-trips "2d6+3" through pickerState and back', () => {
    const original = '2d6+3';
    const pickerState = formulaToPickerState(original);
    expect(pickerState).not.toBeNull();
    expect(pickerState!.dice['d6']).toMatchObject({ count: 2 });
    expect(pickerState!.flatModifier).toBe(3);

    const rebuilt = pickerStateToFormula(pickerState!);
    // The rebuilt formula should parse to the same structure as the original
    const reparsed = parseFormula(rebuilt);
    expect(reparsed).not.toBeNull();
    expect(reparsed!.groups[0]).toMatchObject({ dieType: 'd6', count: 2 });
    expect(reparsed!.flatModifier).toBe(3);
  });

  it('round-trips "2d20kh1" preserving the keep modifier', () => {
    const pickerState = formulaToPickerState('2d20kh1');
    expect(pickerState).not.toBeNull();
    expect(pickerState!.dice['d20']).toMatchObject({
      count: 2,
      keep: { mode: 'kh', n: 1 },
    });

    const rebuilt = pickerStateToFormula(pickerState!);
    const reparsed = parseFormula(rebuilt);
    expect(reparsed).not.toBeNull();
    expect(reparsed!.groups[0]).toMatchObject({
      dieType: 'd20',
      count: 2,
      keep: { mode: 'kh', n: 1 },
    });
  });

  it('returns null for invalid formula in formulaToPickerState', () => {
    expect(formulaToPickerState('garbage')).toBeNull();
  });

  it('returns null for empty formula in formulaToPickerState', () => {
    expect(formulaToPickerState('')).toBeNull();
  });

  it('omits zero-count dice from pickerStateToFormula', () => {
    const state = formulaToPickerState('1d6')!;
    // Verify d4 is not in the formula output
    const formula = pickerStateToFormula(state);
    expect(formula).not.toContain('d4');
    expect(formula).toContain('d6');
  });

  it('pickerStateToFormula outputs d100 as "d100" not "d%"', () => {
    const state = formulaToPickerState('1d100')!;
    const formula = pickerStateToFormula(state);
    expect(formula).toContain('d100');
    expect(formula).not.toContain('d%');
  });

  it('pickerStateToFormula emits dice in canonical order (d4 before d20)', () => {
    const state = formulaToPickerState('1d20+1d4')!;
    const formula = pickerStateToFormula(state);
    // d4 should appear before d20 in the output
    expect(formula.indexOf('d4')).toBeLessThan(formula.indexOf('d20'));
  });

  it('handles negative flat modifier in pickerStateToFormula', () => {
    const state = formulaToPickerState('1d6-2')!;
    const formula = pickerStateToFormula(state);
    expect(formula).toContain('-2');
    const reparsed = parseFormula(formula);
    expect(reparsed!.flatModifier).toBe(-2);
  });
});

// ---------------------------------------------------------------------------
// extractRequiredDice
// ---------------------------------------------------------------------------

describe('extractRequiredDice', () => {
  it('decomposes "2d20kh1+1d8+3d6kl1" into 3 RequiredDie entries', () => {
    const dice = extractRequiredDice('2d20kh1+1d8+3d6kl1');
    expect(dice).toHaveLength(3);

    expect(dice[0]).toMatchObject({
      dieType: 'd20',
      count: 2,
      keep: { mode: 'kh', n: 1 },
    });
    expect(dice[1]).toMatchObject({
      dieType: 'd8',
      count: 1,
    });
    expect(dice[1].keep).toBeUndefined();
    expect(dice[2]).toMatchObject({
      dieType: 'd6',
      count: 3,
      keep: { mode: 'kl', n: 1 },
    });
  });

  it('returns empty array for invalid formula', () => {
    expect(extractRequiredDice('garbage')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractRequiredDice('')).toEqual([]);
  });

  it('decomposes "2d6" into 1 RequiredDie', () => {
    const dice = extractRequiredDice('2d6');
    expect(dice).toHaveLength(1);
    expect(dice[0]).toMatchObject({ dieType: 'd6', count: 2 });
  });
});
