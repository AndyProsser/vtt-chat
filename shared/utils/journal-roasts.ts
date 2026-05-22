const JOURNAL_DM_ROASTS = [
  'The bard wrote three verses about the tavern fight. You wrote nothing.',
  'The wizard prepared spells. You did not prepare one sentence.',
  "The rogue took notes in thieves' cant. You somehow took fewer.",
  'The cleric kept the party alive. The recap did not survive the night.',
  'Your initiative is lower than the empty page.',
  'The goblins had a battle plan. The journal still does not.',
  'Even the gelatinous cube preserves more history than this panel.',
  'The dungeon has layers. Your recap has none.',
  'A mimic shows more commitment to appearing prepared.',
  'The party found treasure. You misplaced the plot summary.',
  'This recap is currently a rumor, not a record.',
  'The ranger tracked six bandits and one owlbear. You lost last session entirely.',
  'A necromancer could raise this recap faster than you wrote it.',
  'The druid remembered every herb. You forgot the entire story beat.',
  'Your notebook failed its saving throw.',
  'The villain monologued longer than this journal exists.',
  'The campaign deserves a chronicle, not an alibi.',
  'Even the cursed sword has clearer documentation.',
  'The party made camp. The recap never arrived.',
  'A kobold intern would have turned in bullet points by now.',
  'The map has landmarks. This recap has plausible deniability.',
  'The session ended. The paperwork did not begin.',
  'You run worlds and yet this page remains unconquered.',
  'The fighter hit every goblin except this deadline.',
  'The lore is canon. Your memory is side quest energy.',
  'A town crier would have filed this faster.',
  'The dice remember more than you wrote down.',
  'Even the trap notes itself with more care.',
  'The artificer could automate this. You chose vibes instead.',
  'The session has become oral tradition.',
  'The dragon kept a hoard. You could not keep one paragraph.',
  'The recap is still in stealth mode, apparently.',
  'A long rest occurred. The journal remained unconscious.',
  'The villain left clues. You left whitespace.',
  'This page is doing a flawless impression of abandoned ruins.',
  'The paladin kept an oath. The recap did not.',
  'The campaign has consequences. This empty panel has excuses.',
  'A goblin accountant would call this negligent.',
  'The recap rolled a natural 1 on showing up.',
  'The warlock signed a pact with better follow-through.',
  'The party crossed a continent. You did not cross the first sentence.',
  'The dungeon master title is doing heavy lifting today.',
  'The NPCs have backstories. This recap has a vacancy.',
  'The monster manual is more current than this journal.',
  'The recap appears to be trapped behind an invisible wall.',
  'The barbarian wrote with more restraint than this omission.',
  'Your prep notes are currently urban legend.',
  'The recap is on a side quest with no return date.',
  'The session had drama. The journal has witness protection.',
  'The cartographer finished the map. The chronicler missed the meeting.',
  'A mimic chest has more reliable storage.',
  'The recap is hiding behind the screen with the snacks.',
  'Even the goblin encounter table is better maintained.',
  'The page is so blank it qualifies as fog of war.',
  'The wizard copied spells this morning. You copied nothing.',
  'The recap has all the urgency of a sleepy ooze.',
  'The campaign timeline is carrying you like a hireling.',
  'The dice tray saw everything. The journal filed no report.',
  'The oracle predicted this procrastination exactly.',
  'The recap is currently an unverified tavern rumor.',
  'A single kobold with a crayon could outperform this output.',
  'The session had stakes. The notes have plausible deniability.',
  'The page remains untouched, like a magic item marked do not attune.',
  'Your memory is doing improv with campaign canon.',
  'The recap has entered the same void as lost socks and side plots.',
  'The party solved the puzzle. The chronicler avoided the obvious.',
  'The campaign deserves a saga. You supplied atmospheric silence.',
  'The druid can speak with animals. Perhaps let the hamsters write it.',
  'The recap is less prepared than a level-one wizard in plate armor.',
  'The treasure log is embarrassed for you.',
  'The journal is making death saves.',
  'The recap has been delayed by adverse destiny conditions.',
  'A town guard incident report would be more thorough.',
  'The villain remembered their scheme. You forgot the aftermath.',
  'The session recap is currently all negative space and regret.',
  'The party reached the boss chamber. The notes never left spawn.',
  'This documentation has the structural integrity of a paper shield.',
  'The recap rolled perception and still found nothing.',
  'A quest board would have summarized this faster.',
  'Your campaign notebook is currently operating on faith and caffeine.',
  'Even the random encounter table feels more intentional.',
  "The page is emptier than the rogue's tax records.",
  'The journal has all the confidence of a goblin siege ladder.',
  'A lich keeps cleaner archives than this.',
  'The recap is late enough to qualify as ancient history.',
  'The party earned experience. The notes earned suspicion.',
  'This panel is waiting for a plot summary like a tavern waits for rain.',
  'The recap is taking the scenic route through the Feywild.',
  'A wandering merchant would have sold three summaries by now.',
  'The campaign is rich in lore. The paperwork is aggressively minimalist.',
  'The recap has all the momentum of an encumbered dwarf uphill.',
  'The bard already embellished it. You have not even recorded it.',
  'The page looks like it passed a stealth check against responsibility.',
  'The recap is more absent than the ranger in a city arc.',
  'The chronicler seems to be on indefinite sabbatical.',
  'The session ended yesterday. The notes are acting like time is optional.',
  'The quest log would like to file a formal complaint.',
  'The recap is trapped in a holding pattern between someday and never.',
  'The story moved forward. The journal stayed in the tavern.',
  'Even the cursed amulet came with more explanation.',
  'This recap has been delayed by a critical shortage of effort.',
  'The page is so empty it echoes.',
  'The heroes advanced the plot. The chronicler advanced excuses.',
] as const

const JOURNAL_PLAYER_ROAST_PREFIXES = [
  'We were apparently expected to remember all of this ourselves.',
  "From the players' side of the table, this is looking suspiciously under-documented.",
  'We survived the session. The recap did not.',
  'Respectfully, our DM left the lore in initiative order and never came back for it.',
  'As players, we would like to report a critical shortage of recap.',
  'The party can confirm events occurred. The paperwork refuses to corroborate.',
  'We brought character sheets. The DM brought confidence and no summary.',
  'From where we are sitting, this feels less like mystery and more like missing admin.',
  'The table remembers fragments. The journal remembers absolutely nothing.',
  'We would ask the DM what happened last session, but apparently that was a stealth mission.',
] as const

function hashJournalSeed(seed: string): number {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }

  return hash
}

export function getRandomJournalDmRoast(): string {
  const index = Math.floor(Math.random() * JOURNAL_DM_ROASTS.length)
  return JOURNAL_DM_ROASTS[index] ?? JOURNAL_DM_ROASTS[0]
}

export function getSeededJournalDmRoast(seed: string): string {
  const index = hashJournalSeed(`${seed}:dm-roast`) % JOURNAL_DM_ROASTS.length
  return JOURNAL_DM_ROASTS[index] ?? JOURNAL_DM_ROASTS[0]
}

export function getPlayerPerspectiveJournalRoast(seed: string, sessionName?: string): string {
  const roastIndex = hashJournalSeed(`${seed}:roast`) % JOURNAL_DM_ROASTS.length
  const prefixIndex = hashJournalSeed(`${seed}:prefix`) % JOURNAL_PLAYER_ROAST_PREFIXES.length
  const prefix = JOURNAL_PLAYER_ROAST_PREFIXES[prefixIndex] ?? JOURNAL_PLAYER_ROAST_PREFIXES[0]
  const roast = JOURNAL_DM_ROASTS[roastIndex] ?? JOURNAL_DM_ROASTS[0]

  if (!sessionName) {
    return `${prefix} ${roast}`
  }

  return `${prefix} Last session, ${sessionName} deserved better notes. ${roast}`
}
