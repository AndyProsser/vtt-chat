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

const JOURNAL_PLAYER_ROASTS = [
  "The recap has not yet materialised. We assume the DM is still waiting for inspiration, a full night's sleep, or both.",
  'Last session: events occurred. At least we think they did. Official confirmation is pending.',
  'We wrote backstories. We built relationships with NPCs. The DM wrote nothing in this box.',
  "The campaign journal remains as blank as the rogue's alibi.",
  'We have collectively decided last session was fine and that nothing consequential happened. This is easier than asking.',
  'The DM remembered every monster stat but apparently not a single plot point worth recording.',
  'We have taken to reconstructing events from dice roll descriptions and ambient vibes. It is going reasonably well.',
  'The recap appears to be on a side quest with no return date.',
  'As players, we would like to submit a formal request for a summary. We filed it after session two. Still awaiting a response.',
  'The session journal confirms what we suspected: the DM has priorities, and documentation is not among them.',
  'Last session is currently oral tradition. Ask the bard player. She has a version.',
  'We all agreed it was a great session. We disagreed about everything that happened in it.',
  'The journal is blank. The campaign is not. We assume these facts are related.',
  'Somewhere between "I\'ll write it later" and now, the recap became someone else\'s problem.',
  'We found treasure, slew monsters, and advanced the plot. None of this is written down.',
  'The campaign notebook is doing a flawless impression of an empty tomb.',
  'The party faces an ancient evil, dwindling supplies, and a DM who has not filed the paperwork.',
  'We have asked about the recap. We have been told "soon." Soon is doing a lot of heavy lifting.',
  'This is the second session without a recap. We are starting to suspect the DM is generating mystery out of administrative neglect.',
  'The journal sits empty while the campaign presses forward on collective guesswork and accumulated trust.',
  'We arrived prepared. We rolled well. We left wondering what was actually going on.',
  'The campaign wiki is being updated by the players from memory. It is extremely lore-accurate, probably.',
  'Session completed. Outcomes noted. Journal: not so much.',
  'The DM remembers every NPC name but apparently the recap is filed under "optional".',
  'We are one missed recap away from treating the last plot thread as retconned.',
  'The players have been carrying this narrative. The journal would like to assist but has not shown up.',
  'We were told there would be continuity. We were told a lot of things.',
  'The recap is in stealth. It has been in stealth for a week. Its stealth check is impeccable.',
  'We know what happened. We are simply not authorised to confirm it officially.',
  'The session ended well. What session? Great question. Please consult the journal. The journal is also asking.',
  'If the recap does not appear soon, we are promoting the dice roll log to canonical source material.',
  'The party pressed on into the unknown. The recap pressed on into the void.',
  'We have begun writing the recap ourselves from the initiative order. It is surprisingly accurate.',
  'Last session: classified. This session: also classified. The campaign: apparently a spy thriller.',
  'The DM narrated six hours of content. None of it appears to have survived to written record.',
  'The NPCs knew more about the plot than we did. We suspect this is intentional. We hope it is not.',
  'The journal has been blank long enough that we have begun to wonder if the campaign is real.',
  'We brought pencils. We rolled dice. We asked for a recap. Only two of those things worked.',
  'The session recap is currently in the same position as the missing loot from session three: officially unconfirmed.',
  'We assumed the recap would arrive with the next session prep. We assumed wrong.',
  'The DM built an entire dungeon and forgot to write one paragraph about the last time we were in it.',
  'Plot threads are dangling. We are catching them by memory alone. It is fine. We are fine.',
  'The journal stands empty as a monument to good intentions and limited follow-through.',
  'If our characters forget the lore, they can blame amnesia. The DM has no such cover.',
  'We have been offered mystery, adventure, and drama. The recap was apparently a limited-time offer.',
  'A blank journal is technically also a form of dramatic tension. We have chosen to believe this.',
  'We survived the dungeon, the dragon, and the social encounter. The documentation did not survive the week.',
  'The session was memorable. The journal is not making that easy to prove.',
  'Last session exists in the collective memory of six people with competing interpretations. It is functionally folklore.',
  'The party advanced the plot. The recap did not advance. The campaign is now running on faith and group chat messages.',
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

export function getSeededJournalDmRoastOptions(seed: string, limit = 50): string[] {
  if (limit <= 0) {
    return []
  }

  const options = [...JOURNAL_DM_ROASTS]
  let state = hashJournalSeed(`${seed}:dm-roast-options`) || 1

  for (let index = options.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    const swapIndex = state % (index + 1)
    const nextValue = options[index]
    options[index] = options[swapIndex] ?? options[index]
    options[swapIndex] = nextValue ?? options[swapIndex]
  }

  return options.slice(0, Math.min(limit, options.length))
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

export function getSeededJournalPlayerRoast(seed: string, sessionName?: string): string {
  const index = hashJournalSeed(`${seed}:player-roast`) % JOURNAL_PLAYER_ROASTS.length
  const roast = JOURNAL_PLAYER_ROASTS[index] ?? JOURNAL_PLAYER_ROASTS[0]

  if (!sessionName) {
    return roast
  }

  return `${roast} (Re: ${sessionName})`
}
