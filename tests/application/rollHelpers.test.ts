import { describe, expect, it } from 'vitest'
import { buildCombinedFormula, normalizeFormulaState, transformCombinedFormula, transformSavedFormulaRoll } from '../../src/application/rollHelpers'

describe('rollHelpers', () => {
  it('combines selected formulas in order', () => {
    expect(buildCombinedFormula(['1d20+3', '4d12+1'])).toBe('1d20+3+4d12+1')
  })

  it('applies doubled dice and doubled-all transformations', () => {
    const combined = '1d12+3d6+4'

    expect(transformCombinedFormula(combined, 'normal')).toBe('1d12+3d6+4')
    expect(transformCombinedFormula(combined, 'doubleDice')).toBe('2d12+6d6+4')
    expect(transformCombinedFormula(combined, 'doubleAll')).toBe('(1d12+3d6+4)*2')
  })

  it('transforms saved formulas for roll variants', () => {
    const formula = '1d12+3d6+4'

    expect(transformSavedFormulaRoll(formula, 'normal')).toBe('1d12+3d6+4')
    expect(transformSavedFormulaRoll(formula, 'doubleDice')).toBe('2d12+6d6+4')
    expect(transformSavedFormulaRoll(formula, 'doubleAll')).toBe('(1d12+3d6+4)*2')
  })

  it('preserves grouped expressions when applying Double All', () => {
    const formula = '(1d8+4)/2'

    expect(transformCombinedFormula(formula, 'doubleAll')).toBe('((1d8+4)/2)*2')
    expect(transformSavedFormulaRoll(formula, 'doubleAll')).toBe('((1d8+4)/2)*2')
  })

  it('preserves the canonical expression when normalizing a formula state', () => {
    const normalized = normalizeFormulaState('((1d8+4)/2)*2')

    expect(normalized).not.toBeNull()
    expect(normalized?.formulaText).toBe('((1d8+4)/2)*2')
  })
})