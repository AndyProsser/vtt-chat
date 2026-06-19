/**
 * Dice Roller
 * Parses standard dice notation (NdX[+/-M]) and ADV/DIS shorthand
 * (ADVdX, DISdX, AdX, DdX) and produces a server-side roll result.
 * Results are authoritative — rolling happens here, never on the client.
 */

export interface DiceExpression {
  count: number
  sides: number
  modifier: number
  /** Normalised expression string for storage, e.g. "2d6+3" or "ADVd20+5" */
  expression: string
  /** Set for advantage/disadvantage rolls — always rolls 2 dice, keeps highest/lowest */
  advantage?: 'ADV' | 'DIS'
}

export interface RollResult {
  expression: string
  rolls: number[]
  /** For ADV/DIS: index into rolls[] that was kept to compute the total */
  keptIndex?: number
  modifier: number
  total: number
  advantage?: 'ADV' | 'DIS'
}

const DICE_PATTERN = /^(\d+)d(\d+)([+-]\d+)?$/i
/** Matches ADVdX, DISdX, AdX, DdX with optional modifier */
const ADV_DIS_PATTERN = /^(ADV|DIS|A|D)d(\d+)([+-]\d+)?$/i

const MAX_DICE_COUNT = 100
const MAX_DICE_SIDES = 1000

function parseAdvantagePrefix(prefix: string): 'ADV' | 'DIS' {
  return prefix.toUpperCase() === 'ADV' || prefix.toUpperCase() === 'A' ? 'ADV' : 'DIS'
}

function modifierSuffix(modifier: number): string {
  if (modifier === 0) return ''
  return modifier > 0 ? `+${modifier}` : `${modifier}`
}

/**
 * Parse a dice expression string.
 * Accepts standard notation (NdX[+/-M]) and advantage/disadvantage shorthand
 * (ADVdX, DISdX, AdX, DdX) with optional modifiers.
 * Returns null if the expression is not valid.
 */
export function parseDiceExpression(raw: string): DiceExpression | null {
  const trimmed = raw.trim()

  const standard = trimmed.match(DICE_PATTERN)
  if (standard) {
    const count = parseInt(standard[1], 10)
    const sides = parseInt(standard[2], 10)
    const modifier = standard[3] ? parseInt(standard[3], 10) : 0
    if (count < 1 || count > MAX_DICE_COUNT) return null
    if (sides < 2 || sides > MAX_DICE_SIDES) return null
    return { count, sides, modifier, expression: `${count}d${sides}${modifierSuffix(modifier)}` }
  }

  const advDis = trimmed.match(ADV_DIS_PATTERN)
  if (advDis) {
    const advantage = parseAdvantagePrefix(advDis[1])
    const sides = parseInt(advDis[2], 10)
    const modifier = advDis[3] ? parseInt(advDis[3], 10) : 0
    if (sides < 2 || sides > MAX_DICE_SIDES) return null
    return {
      count: 2,
      sides,
      modifier,
      expression: `${advantage}d${sides}${modifierSuffix(modifier)}`,
      advantage,
    }
  }

  return null
}

/** Roll a single die with the given number of sides (1-indexed). */
function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

/**
 * Execute a parsed dice expression and return the full result.
 * For ADV/DIS expressions, rolls two dice and keeps the highest (ADV) or lowest (DIS).
 */
export function executeDiceRoll(expr: DiceExpression): RollResult {
  const rolls = Array.from({ length: expr.count }, () => rollDie(expr.sides))

  if (expr.advantage) {
    const kept = expr.advantage === 'ADV' ? Math.max(...rolls) : Math.min(...rolls)
    const keptIndex = rolls.indexOf(kept)
    return {
      expression: expr.expression,
      rolls,
      keptIndex,
      modifier: expr.modifier,
      total: kept + expr.modifier,
      advantage: expr.advantage,
    }
  }

  return {
    expression: expr.expression,
    rolls,
    modifier: expr.modifier,
    total: rolls.reduce((sum, r) => sum + r, 0) + expr.modifier,
  }
}

/**
 * Parse and roll in one step. Returns null if the expression is invalid.
 */
export function rollDice(raw: string): RollResult | null {
  const expr = parseDiceExpression(raw)
  if (!expr) return null
  return executeDiceRoll(expr)
}
