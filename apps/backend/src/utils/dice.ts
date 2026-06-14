/**
 * Dice Roller
 * Parses standard dice notation (NdX[+/-M]) and produces a server-side roll result.
 * Results are authoritative — rolling happens here, never on the client.
 */

export interface DiceExpression {
  count: number
  sides: number
  modifier: number
  /** Normalised expression string for storage, e.g. "2d6+3" */
  expression: string
}

export interface RollResult {
  expression: string
  rolls: number[]
  modifier: number
  total: number
}

const DICE_PATTERN = /^(\d+)d(\d+)([+-]\d+)?$/i

const MAX_DICE_COUNT = 100
const MAX_DICE_SIDES = 1000

/**
 * Parse a dice expression string.
 * Returns null if the expression is not valid notation.
 */
export function parseDiceExpression(raw: string): DiceExpression | null {
  const trimmed = raw.trim()
  const match = trimmed.match(DICE_PATTERN)
  if (!match) return null

  const count = parseInt(match[1], 10)
  const sides = parseInt(match[2], 10)
  const modifier = match[3] ? parseInt(match[3], 10) : 0

  if (count < 1 || count > MAX_DICE_COUNT) return null
  if (sides < 2 || sides > MAX_DICE_SIDES) return null

  const expression =
    modifier === 0 ? `${count}d${sides}` : `${count}d${sides}${modifier > 0 ? '+' : ''}${modifier}`

  return { count, sides, modifier, expression }
}

/** Roll a single die with the given number of sides (1-indexed). */
function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

/**
 * Execute a parsed dice expression and return the full result.
 */
export function executeDiceRoll(expr: DiceExpression): RollResult {
  const rolls = Array.from({ length: expr.count }, () => rollDie(expr.sides))
  const total = rolls.reduce((sum, r) => sum + r, 0) + expr.modifier
  return {
    expression: expr.expression,
    rolls,
    modifier: expr.modifier,
    total,
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
