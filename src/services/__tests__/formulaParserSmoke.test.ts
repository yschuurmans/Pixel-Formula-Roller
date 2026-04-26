import { DiceRoller, DiceRoll } from 'rpg-dice-roller'

describe('rpg-dice-roller smoke test', () => {
  it('rolls "2d6+3" without throwing and returns a numeric total', () => {
    const roller = new DiceRoller()
    const result = roller.roll('2d6+3')
    const roll = Array.isArray(result) ? result[0] : result as DiceRoll
    expect(roll).toBeDefined()
    expect(typeof roll.total).toBe('number')
    expect(roll.total).toBeGreaterThanOrEqual(5)  // min: 1+1+3
    expect(roll.total).toBeLessThanOrEqual(15)    // max: 6+6+3
  })
})
