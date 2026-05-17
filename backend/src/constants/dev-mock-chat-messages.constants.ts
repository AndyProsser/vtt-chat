export type SimulatedMessageType = 'IC' | 'OOC' | 'WHISPER' | 'DM'

export interface SimulatedChatTemplate {
  type: SimulatedMessageType
  content: string
}

export const DEV_MOCK_CHAT_MESSAGES: SimulatedChatTemplate[] = [
  { type: 'IC', content: `Run.` },
  { type: 'IC', content: `Duck!` },
  { type: 'IC', content: `Lantern.` },
  { type: 'IC', content: `Ambush?` },
  { type: 'IC', content: `North.` },
  { type: 'IC', content: `Wait.` },
  {
    type: 'IC',
    content: `The ravens stop calling all at once and the forest goes unnaturally still.`,
  },
  {
    type: 'IC',
    content: `**Field plan:**
- Scout lane 3
- Hold point at marker B
- Fallback to the bell tower

"Move on my count."`,
  },
  {
    type: 'IC',
    content: `I trade my last healing draught to the mercenary for the password to the vault wing.`,
  },
  {
    type: 'IC',
    content: `I read the ward script aloud and emphasize **line 7** where the binding fails at moonrise.`,
  },
  {
    type: 'IC',
    content: `I brace the door with my shield and call for the others to clear the hall.`,
  },
  {
    type: 'IC',
    content: `I sweep the altar with a mirror to check for glyph reflections before stepping closer.`,
  },
  {
    type: 'IC',
    content: `The cobblestones are still warm; someone with fire magic passed this way minutes ago.`,
  },
  {
    type: 'IC',
    content: `I kneel and track the prints toward the river gate where the watch rotation changes.`,
  },
  {
    type: 'IC',
    content: `**Field plan:**
- Scout lane 5
- Hold point at marker C
- Fallback to the bell tower

"Move on my count."`,
  },
  {
    type: 'IC',
    content: `I unwind the map and mark two routes through the marsh, one quiet and one fast.`,
  },
  {
    type: 'IC',
    content: `The ravens stop calling all at once and the forest goes unnaturally still.`,
  },
  { type: 'IC', content: `I test the pressure plate with a ten-foot pole before anyone crosses.` },
  {
    type: 'IC',
    content: `I read the ward script aloud and emphasize **line 16** where the binding fails at moonrise.`,
  },
  {
    type: 'IC',
    content: `I hold the line at the stairs and signal the wizard to finish the seal.`,
  },
  {
    type: 'IC',
    content: `I brace the door with my shield and call for the others to clear the hall.`,
  },
  {
    type: 'IC',
    content: `**Field plan:**
- Scout lane 2
- Hold point at marker D
- Fallback to the bell tower

"Move on my count."`,
  },
  {
    type: 'IC',
    content: `The cobblestones are still warm; someone with fire magic passed this way minutes ago.`,
  },
  {
    type: 'IC',
    content: `I kneel and track the prints toward the river gate where the watch rotation changes.`,
  },
  {
    type: 'IC',
    content: `I keep my voice low and ask the innkeeper which room was paid for in silver marks.`,
  },
  {
    type: 'IC',
    content: `I unwind the map and mark two routes through the marsh, one quiet and one fast.`,
  },
  {
    type: 'IC',
    content: `The ravens stop calling all at once and the forest goes unnaturally still.`,
  },
  {
    type: 'IC',
    content: `I read the ward script aloud and emphasize **line 25** where the binding fails at moonrise.`,
  },
  { type: 'DM', content: `DM, this stays between us.` },
  { type: 'DM', content: `DM, I think I spotted a trap trigger near the statue base.` },
  { type: 'DM', content: `DM, can I inspect this privately without alerting the group?` },
  { type: 'DM', content: `DM, my character is lying about the map.` },
  { type: 'DM', content: `DM, I want to pass you a secret note after this scene.` },
  { type: 'DM', content: `DM, I am concealing the second key in my sleeve.` },
  { type: 'DM', content: `DM, I plan to betray the contact if talks collapse.` },
  { type: 'DM', content: `DM, can I quietly check for poison in the cup?` },
  { type: 'DM', content: `DM, I want to tail the courier without telling the party.` },
  { type: 'DM', content: `DM, I pocketed the ring and said the drawer was empty.` },
  { type: 'DM', content: `DM, I am signaling the guard with our old cant.` },
  { type: 'DM', content: `DM, I will cast the spell subtly and hide the gesture.` },
  { type: 'DM', content: `DM, I wrote a forged seal while everyone argued.` },
  { type: 'DM', content: `DM, I want a quick perception check on the rafters.` },
  { type: 'DM', content: `DM, I am testing whether the priest recognizes my crest.` },
  { type: 'DM', content: `DM, I leave chalk marks for my ally only.` },
  { type: 'DM', content: `DM, I am pretending confidence but I am actually spooked.` },
  { type: 'DM', content: `DM, I hide the ledger page in my boot.` },
  { type: 'DM', content: `DM, I want to feed a false route to the rival scout.` },
  { type: 'DM', content: `DM, I am counting arrows and not telling the table.` },
  { type: 'DM', content: `DM, I quietly lock the side door after we pass.` },
  { type: 'DM', content: `DM, I stashed coin for a bribe before we entered.` },
  { type: 'DM', content: `DM, I will fake a stumble to distract the sentry.` },
  { type: 'DM', content: `DM, I am checking if this rune matches my old notes.` },
  { type: 'DM', content: `DM, I want to ask the NPC about my backstory tie.` },
  { type: 'DM', content: `DM, I pass the real map to my familiar, not the party.` },
  { type: 'DM', content: `DM, I am planting evidence in the study.` },
  { type: 'DM', content: `DM, I keep one spell slot hidden for later.` },
  { type: 'DM', content: `DM, I am listening at the wall while they debate.` },
  { type: 'DM', content: `DM, I want to test the lock with a hairpin first.` },
  { type: 'DM', content: `DM, I leave a coded warning for the captain.` },
  { type: 'DM', content: `DM, I tell a half-truth if questioned by the steward.` },
  { type: 'DM', content: `DM, I am looking for hidden observers in the gallery.` },
  { type: 'DM', content: `DM, I swap the potion labels before anyone notices.` },
  { type: 'DM', content: `DM, I mark the escape tunnel with twine knots.` },
  { type: 'DM', content: `DM, I want to bluff that I am expected upstairs.` },
  { type: 'DM', content: `DM, I am preparing a fallback lie for the checkpoint.` },
  { type: 'DM', content: `DM, I ask for a private insight read on the envoy.` },
  { type: 'DM', content: `DM, I keep the cursed coin instead of dropping it.` },
  { type: 'DM', content: `DM, I want to quietly inspect the altar seam.` },
  { type: 'DM', content: `DM, I am setting a tripwire behind us.` },
  { type: 'DM', content: `DM, I hide my holy symbol before entering the chapel.` },
  { type: 'DM', content: `DM, I am timing the patrol steps in my head.` },
  { type: 'DM', content: `DM, I pocket the wax stamp and leave the case open.` },
  { type: 'DM', content: `DM, I want to pass a silent signal to one ally.` },
  { type: 'DM', content: `DM, I am checking if the mirror is one-way.` },
  { type: 'DM', content: `DM, I wrote the wrong name on purpose in the ledger.` },
  { type: 'DM', content: `DM, I intend to claim the relic if it is sentient.` },
  { type: 'DM', content: `DM, I hide my fear and keep talking to the duke.` },
  { type: 'DM', content: `DM, I slip a note under the door before we move.` },
  {
    type: 'IC',
    content: `**Field plan:**
- Scout lane 4
- Hold point at marker E
- Fallback to the bell tower

"Move on my count."`,
  },
  {
    type: 'IC',
    content: `I hold the line at the stairs and signal the wizard to finish the seal.`,
  },
  {
    type: 'IC',
    content: `I brace the door with my shield and call for the others to clear the hall.`,
  },
  {
    type: 'IC',
    content: `I sweep the altar with a mirror to check for glyph reflections before stepping closer.`,
  },
  {
    type: 'IC',
    content: `The cobblestones are still warm; someone with fire magic passed this way minutes ago.`,
  },
  {
    type: 'IC',
    content: `I kneel and track the prints toward the river gate where the watch rotation changes.`,
  },
  {
    type: 'IC',
    content: `I keep my voice low and ask the innkeeper which room was paid for in silver marks.`,
  },
  {
    type: 'IC',
    content: `**Field plan:**
- Scout lane 1
- Hold point at marker F
- Fallback to the bell tower

"Move on my count."`,
  },
  {
    type: 'IC',
    content: `I read the ward script aloud and emphasize **line 34** where the binding fails at moonrise.`,
  },
  { type: 'IC', content: `I test the pressure plate with a ten-foot pole before anyone crosses.` },
  {
    type: 'IC',
    content: `I trade my last healing draught to the mercenary for the password to the vault wing.`,
  },
  {
    type: 'IC',
    content: `I hold the line at the stairs and signal the wizard to finish the seal.`,
  },
  {
    type: 'IC',
    content: `I brace the door with my shield and call for the others to clear the hall.`,
  },
  {
    type: 'IC',
    content: `I sweep the altar with a mirror to check for glyph reflections before stepping closer.`,
  },
  {
    type: 'IC',
    content: `**Field plan:**
- Scout lane 3
- Hold point at marker A
- Fallback to the bell tower

"Move on my count."`,
  },
  {
    type: 'IC',
    content: `I kneel and track the prints toward the river gate where the watch rotation changes.`,
  },
  {
    type: 'IC',
    content: `I keep my voice low and ask the innkeeper which room was paid for in silver marks.`,
  },
  {
    type: 'IC',
    content: `I read the ward script aloud and emphasize **line 43** where the binding fails at moonrise.`,
  },
  {
    type: 'IC',
    content: `The ravens stop calling all at once and the forest goes unnaturally still.`,
  },
  { type: 'IC', content: `I test the pressure plate with a ten-foot pole before anyone crosses.` },
  {
    type: 'IC',
    content: `I trade my last healing draught to the mercenary for the password to the vault wing.`,
  },
  {
    type: 'IC',
    content: `**Field plan:**
- Scout lane 5
- Hold point at marker B
- Fallback to the bell tower

"Move on my count."`,
  },
  { type: 'OOC', content: `lol` },
  { type: 'OOC', content: `brb` },
  { type: 'OOC', content: `nice` },
  { type: 'OOC', content: `oops` },
  { type: 'OOC', content: `ready` },
  { type: 'OOC', content: `afk 2` },
  { type: 'OOC', content: `If we are ending soon, I can handle the ledger summary in notes.` },
  { type: 'OOC', content: `I need clarification on line of sight through the broken window.` },
  {
    type: 'OOC',
    content: `Quick table sync:
- rest timing
- loot split
- next objective

I am fine with majority call.`,
  },
  { type: 'OOC', content: `I can stay for one more encounter before I need to drop.` },
  {
    type: 'OOC',
    content: `Can we mark this as a checkpoint? I want to keep notes consistent after scene 10.`,
  },
  { type: 'OOC', content: `I can cover initiative tracking this round if that helps pace.` },
  { type: 'OOC', content: `My audio is stable again, no lag now.` },
  { type: 'OOC', content: `Can we pause for one minute while I update prepared spells?` },
  { type: 'OOC', content: `I am good with either plan, but stealth seems safer for resources.` },
  { type: 'OOC', content: `Recap for me please: we have the sigil, not the key, right?` },
  {
    type: 'OOC',
    content: `Quick table sync:
- rest timing
- loot split
- next objective

I am fine with majority call.`,
  },
  { type: 'OOC', content: `I need clarification on line of sight through the broken window.` },
  { type: 'OOC', content: `Great scene pacing there, that reveal landed really well.` },
  { type: 'OOC', content: `I can stay for one more encounter before I need to drop.` },
  {
    type: 'OOC',
    content: `Can we mark this as a checkpoint? I want to keep notes consistent after scene 20.`,
  },
  { type: 'OOC', content: `I can cover initiative tracking this round if that helps pace.` },
  { type: 'OOC', content: `My audio is stable again, no lag now.` },
  { type: 'OOC', content: `Can we pause for one minute while I update prepared spells?` },
  {
    type: 'OOC',
    content: `Quick table sync:
- rest timing
- loot split
- next objective

I am fine with majority call.`,
  },
  { type: 'OOC', content: `Recap for me please: we have the sigil, not the key, right?` },
  { type: 'OOC', content: `If we are ending soon, I can handle the ledger summary in notes.` },
  { type: 'OOC', content: `I need clarification on line of sight through the broken window.` },
  { type: 'OOC', content: `Great scene pacing there, that reveal landed really well.` },
  { type: 'OOC', content: `I can stay for one more encounter before I need to drop.` },
  {
    type: 'OOC',
    content: `Can we mark this as a checkpoint? I want to keep notes consistent after scene 30.`,
  },
  { type: 'OOC', content: `I can cover initiative tracking this round if that helps pace.` },
  {
    type: 'OOC',
    content: `Quick table sync:
- rest timing
- loot split
- next objective

I am fine with majority call.`,
  },
  { type: 'OOC', content: `Can we pause for one minute while I update prepared spells?` },
  { type: 'OOC', content: `I am good with either plan, but stealth seems safer for resources.` },
  { type: 'OOC', content: `Recap for me please: we have the sigil, not the key, right?` },
  { type: 'OOC', content: `If we are ending soon, I can handle the ledger summary in notes.` },
  { type: 'OOC', content: `I need clarification on line of sight through the broken window.` },
  { type: 'OOC', content: `Great scene pacing there, that reveal landed really well.` },
  { type: 'OOC', content: `I can stay for one more encounter before I need to drop.` },
  {
    type: 'OOC',
    content: `Quick table sync:
- rest timing
- loot split
- next objective

I am fine with majority call.`,
  },
  { type: 'OOC', content: `I can cover initiative tracking this round if that helps pace.` },
  { type: 'OOC', content: `My audio is stable again, no lag now.` },
  { type: 'OOC', content: `Can we pause for one minute while I update prepared spells?` },
  { type: 'OOC', content: `I am good with either plan, but stealth seems safer for resources.` },
  { type: 'OOC', content: `Recap for me please: we have the sigil, not the key, right?` },
  { type: 'OOC', content: `If we are ending soon, I can handle the ledger summary in notes.` },
  { type: 'OOC', content: `I need clarification on line of sight through the broken window.` },
  {
    type: 'OOC',
    content: `Quick table sync:
- rest timing
- loot split
- next objective

I am fine with majority call.`,
  },
  { type: 'OOC', content: `I can stay for one more encounter before I need to drop.` },
  { type: 'WHISPER', content: `Now.` },
  { type: 'WHISPER', content: `Later.` },
  { type: 'WHISPER', content: `Quiet.` },
  { type: 'WHISPER', content: `Trust me.` },
  { type: 'WHISPER', content: `Not here.` },
  { type: 'WHISPER', content: `Follow me.` },
  {
    type: 'WHISPER',
    content: `Private move order:
- close shutters
- hide ledger under tarps
- wait for two knocks

No one else enters.`,
  },
  { type: 'WHISPER', content: `If I go down, take page seven and burn it before dawn.` },
  { type: 'WHISPER', content: `Do not trust the steward; he recognized your crest immediately.` },
  { type: 'WHISPER', content: `Meet me by the stables after curfew and bring only one lantern.` },
  {
    type: 'WHISPER',
    content: `Do not mention the second letter yet; let me test their reaction first.`,
  },
  {
    type: 'WHISPER',
    content: `I am not saying this in open chat: the mirror answered when you spoke the old family name.`,
  },
  {
    type: 'WHISPER',
    content: `Private move order:
- close shutters
- hide ledger under tarps
- wait for two knocks

No one else enters.`,
  },
  { type: 'WHISPER', content: `The captain is stalling for reinforcements from the west road.` },
  { type: 'WHISPER', content: `Keep the satchel sealed until we can verify the wax mark.` },
  { type: 'WHISPER', content: `I can forge papers tonight, but I need your signet for an hour.` },
  {
    type: 'WHISPER',
    content: `I heard the phrase moonfall twice; that sounds like a timetable, not a code.`,
  },
  { type: 'WHISPER', content: `If I go down, take page seven and burn it before dawn.` },
  {
    type: 'WHISPER',
    content: `Private move order:
- close shutters
- hide ledger under tarps
- wait for two knocks

No one else enters.`,
  },
  { type: 'WHISPER', content: `Meet me by the stables after curfew and bring only one lantern.` },
  {
    type: 'WHISPER',
    content: `Do not mention the second letter yet; let me test their reaction first.`,
  },
  { type: 'WHISPER', content: `I hid the real key in my boot lining before we entered the manor.` },
  {
    type: 'WHISPER',
    content: `I am not saying this in open chat: the mirror answered when you spoke the old family name.`,
  },
  { type: 'WHISPER', content: `The captain is stalling for reinforcements from the west road.` },
  {
    type: 'WHISPER',
    content: `Private move order:
- close shutters
- hide ledger under tarps
- wait for two knocks

No one else enters.`,
  },
  { type: 'WHISPER', content: `I can forge papers tonight, but I need your signet for an hour.` },
  {
    type: 'WHISPER',
    content: `I heard the phrase moonfall twice; that sounds like a timetable, not a code.`,
  },
  { type: 'WHISPER', content: `If I go down, take page seven and burn it before dawn.` },
  { type: 'WHISPER', content: `Do not trust the steward; he recognized your crest immediately.` },
  { type: 'WHISPER', content: `Meet me by the stables after curfew and bring only one lantern.` },
  {
    type: 'WHISPER',
    content: `Private move order:
- close shutters
- hide ledger under tarps
- wait for two knocks

No one else enters.`,
  },
  { type: 'WHISPER', content: `I hid the real key in my boot lining before we entered the manor.` },
  { type: 'WHISPER', content: `If talks fail, circle behind the chapel and wait for my signal.` },
  {
    type: 'WHISPER',
    content: `I am not saying this in open chat: the mirror answered when you spoke the old family name.`,
  },
  { type: 'WHISPER', content: `Keep the satchel sealed until we can verify the wax mark.` },
  { type: 'WHISPER', content: `I can forge papers tonight, but I need your signet for an hour.` },
  {
    type: 'WHISPER',
    content: `Private move order:
- close shutters
- hide ledger under tarps
- wait for two knocks

No one else enters.`,
  },
  { type: 'WHISPER', content: `If I go down, take page seven and burn it before dawn.` },
  { type: 'WHISPER', content: `Do not trust the steward; he recognized your crest immediately.` },
  { type: 'WHISPER', content: `Meet me by the stables after curfew and bring only one lantern.` },
  {
    type: 'WHISPER',
    content: `Do not mention the second letter yet; let me test their reaction first.`,
  },
  { type: 'WHISPER', content: `I hid the real key in my boot lining before we entered the manor.` },
  {
    type: 'WHISPER',
    content: `Private move order:
- close shutters
- hide ledger under tarps
- wait for two knocks

No one else enters.`,
  },
  { type: 'WHISPER', content: `The captain is stalling for reinforcements from the west road.` },
  {
    type: 'WHISPER',
    content: `I am not saying this in open chat: the mirror answered when you spoke the old family name.`,
  },
  { type: 'WHISPER', content: `I can forge papers tonight, but I need your signet for an hour.` },
  {
    type: 'WHISPER',
    content: `I heard the phrase moonfall twice; that sounds like a timetable, not a code.`,
  },
  { type: 'WHISPER', content: `If I go down, take page seven and burn it before dawn.` },
  {
    type: 'WHISPER',
    content: `Private move order:
- close shutters
- hide ledger under tarps
- wait for two knocks

No one else enters.`,
  },
  { type: 'WHISPER', content: `Meet me by the stables after curfew and bring only one lantern.` },
]
