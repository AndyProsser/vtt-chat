#!/usr/bin/env node

/**
 * VTT-Chat AI Output Linter
 * -----------------------------------------
 * This script checks AI-generated output for violations of:
 *  - docs/ai/AI-CONTEXT.md
 *  - docs/ai/PROMPTING-RULES.md
 *
 * It enforces:
 *  - Architecture compliance
 *  - Privacy rules
 *  - Role boundaries
 *  - Event/reducer/store purity
 *  - Extension safety
 *  - No hallucinated features
 *  - No forbidden behaviours
 *
 * Usage:
 *   node lint-ai-output.js <file>
 */

const fs = require('fs')

const file = process.argv[2]
if (!file) {
  console.error('Usage: node lint-ai-output.js <file>')
  process.exit(1)
}

const text = fs.readFileSync(file, 'utf8')

// ---------------------------------------------
// RULE DEFINITIONS
// ---------------------------------------------

const rules = [
  // ---------------------------
  // ARCHITECTURE VIOLATIONS
  // ---------------------------
  {
    id: 'ARCH-001',
    description: 'Direct state mutation is forbidden',
    regex: /\b(state\s*=\s*|state\.[a-zA-Z0-9_]+\s*=)/i,
  },
  {
    id: 'ARCH-002',
    description: 'Reducers must not contain side effects',
    regex: /\b(fetch|axios|await|setTimeout|setInterval|localStorage|document\.|window\.)/i,
  },
  {
    id: 'ARCH-003',
    description: 'Bypassing the event system is forbidden',
    regex: /\bstore\.(setState|update|mutate)/i,
  },

  // ---------------------------
  // PRIVACY VIOLATIONS
  // ---------------------------
  {
    id: 'PRIV-001',
    description: 'AI must not reveal private notes',
    regex: /\bprivate note\b|\bplayer-private\b/i,
  },
  {
    id: 'PRIV-002',
    description: 'AI must not reveal whispers',
    regex: /\bwhisper content\b|\bwhisper visibility\b/i,
  },

  // ---------------------------
  // ROLE VIOLATIONS
  // ---------------------------
  {
    id: 'ROLE-001',
    description: 'Players must not be given DM-only capabilities',
    regex: /\bplayer.*(pause|end|lock|override|force)\b/i,
  },
  {
    id: 'ROLE-002',
    description: 'Spectators must not have interactive capabilities',
    regex: /\bspectator.*(edit|send|trigger|modify|control)\b/i,
  },

  // ---------------------------
  // EXTENSION VIOLATIONS
  // ---------------------------
  {
    id: 'EXT-001',
    description: 'Extension must not modify VTT DOM directly',
    regex: /\b(document\.querySelector|document\.getElement|innerHTML|appendChild)\b/i,
  },
  {
    id: 'EXT-002',
    description: 'Extension must not access private data',
    regex: /\b(private|dm-only|system-private)\b.*(extension|overlay)/i,
  },

  // ---------------------------
  // HALLUCINATION CHECKS
  // ---------------------------
  {
    id: 'HALL-001',
    description: 'AI must not invent new roles',
    regex: /\b(admin|moderator|observer|gm|npc)\b/i,
  },
  {
    id: 'HALL-002',
    description: 'AI must not invent new subsystems',
    regex: /\b(inventory|combat|initiative|map editor|token engine)\b/i,
  },
  {
    id: 'HALL-003',
    description: 'AI must not invent new architecture components',
    regex: /\b(middleware|saga|thunk|graphql|orm)\b/i,
  },

  // ---------------------------
  // FORMAT VIOLATIONS
  // ---------------------------
  {
    id: 'FMT-001',
    description: 'Output must be Markdown',
    regex: /<[^>]+>/, // crude HTML detection
  },
]

// ---------------------------------------------
// RUN LINTER
// ---------------------------------------------

let violations = []

rules.forEach((rule) => {
  if (rule.regex.test(text)) {
    violations.push(rule)
  }
})

// ---------------------------------------------
// REPORT
// ---------------------------------------------

if (violations.length === 0) {
  console.log('✔ No AI rule violations detected.')
  process.exit(0)
}

console.log('❌ AI Output Violations Detected:\n')

violations.forEach((v) => {
  console.log(` - [${v.id}] ${v.description}`)
})

console.log('\nPlease correct these issues before committing.')
process.exit(1)
