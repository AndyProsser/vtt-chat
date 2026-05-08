# UX Principles

These UX Principles define how VTT‑Chat should feel, behave, and respond.
They guide every UI decision — from component layout to animation timing to role‑based visibility.
They ensure the platform remains:

- Predictable
- Lightweight
- Role‑aware
- Non‑intrusive
- Emotionally supportive of tabletop play

These principles apply to the core app, the extension overlay, and all future UI surfaces.

---

## 1. Core UX Philosophy

### **1.1 The UI Should Support the Table, Not Replace It**

The interface exists to enhance human interaction, not dominate it.
It should feel like a natural extension of the tabletop experience.

### **1.2 Predictability Builds Trust**

Users should always know:

- What will happen when they click something
- Why something is visible or hidden
- What their role allows them to do

No surprises. No hidden behaviours.

### **1.3 Minimal Cognitive Load**

The UI should reduce mental overhead, not increase it.

- Clear labels
- Simple layouts
- Obvious affordances
- No unnecessary options

### **1.4 Motion Reinforces Meaning**

Animations must:

- Support state changes
- Be subtle
- Be purposeful
- Never distract

Motion is a communication tool, not decoration.

### **1.5 Role‑Aware by Design**

The UI adapts to:

- DM
- Player
- Spectator

Each role sees only what they should.

### **1.6 Privacy‑Respecting**

The UI must never:

- Reveal private notes
- Leak whisper contents
- Expose DM‑only data
- Display system‑private information

Privacy is a first‑class UX concern.

---

## 2. Layout Principles

### **2.1 Panels Should Be Modular**

Chat, notes, audio, and tools are separate panels that can be:

- Docked
- Undocked
- Collapsed
- Resized

### **2.2 Non‑Blocking by Default**

Panels must never block:

- Token movement
- Map interaction
- VTT menus

### **2.3 Clear Hierarchy**

The UI should communicate importance through:

- Size
- Position
- Contrast
- Motion

### **2.4 Consistent Spacing & Rhythm**

Spacing should follow a consistent scale:

- 4px micro spacing
- 8px small spacing
- 16px medium spacing
- 24px large spacing

---

## 3. Interaction Principles

### **3.1 Immediate Feedback**

Every interaction should produce immediate feedback:

- Button press
- Message send
- Note save
- Audio trigger

### **3.2 Undo Where Possible**

Users should be able to undo:

- Note edits
- Message deletions (future)

### **3.3 No Dead Ends**

Every UI state must have a clear exit.

### **3.4 Accessible by Default**

The UI must support:

- Keyboard navigation
- Screen readers
- High‑contrast mode (future)

---

## 4. Role‑Based UX

---

### 4.1 DM UX

DMs see:

- Session controls
- Audio presets
- Presence overrides
- DM tools
- VTT actions (if supported)

DM UX must feel:

- Powerful
- Efficient
- Safe
- Non‑overwhelming

---

### 4.2 Player UX

Players see:

- Chat
- Notes
- Audio triggers
- Presence

Player UX must feel:

- Empowering
- Clear
- Non‑intrusive
- Respectful of privacy

---

### 4.3 Spectator UX

Spectators see:

- Read‑only chat
- Presence

Spectator UX must feel:

- Lightweight
- Passive
- Non‑interactive

Exception:

- During end-of-session finale cooldown, spectators may interact with players/DM in public stage chat/voice only.

---

## 5. Chat UX Principles

### **5.1 IC and OOC Must Be Visually Distinct**

Players should instantly know the tone of a message.

### **5.2 Whispers Must Feel Private**

Whispers should:

- Be visually separated
- Use subtle styling
- Never appear in public chat

### **5.3 System Messages Must Be Clear**

System messages should:

- Stand out
- Be concise
- Never overwhelm the chat feed

---

## 6. Notes UX Principles

### **6.1 Private Notes Must Feel Safe**

Players should feel confident that:

- Only they can see their private notes
- The UI reinforces this privacy

### **6.2 Shared Notes Must Be Collaborative**

Shared notes should:

- Update in real time
- Show authorship
- Support simple formatting

---

## 7. Audio UX Principles

### **7.1 Audio Should Feel Responsive**

Triggering an effect should feel instant.

### **7.2 DM Controls Should Be Clear**

DM audio tools must:

- Be easy to find
- Be easy to understand
- Avoid overwhelming options

### **7.3 Local vs Global Must Be Obvious**

Players should know when an effect is:

- Local (just them)
- Global (everyone)

---

## 8. Presence UX Principles

### **8.1 Presence Should Be Ambient**

Presence indicators should:

- Be subtle
- Be informative
- Never distract

### **8.2 Speaking Indicators Should Be Clear**

Voice activity should be:

- Smooth
- Non‑intrusive
- Easy to understand

### **8.3 Typing Indicators Should Be Lightweight**

Typing indicators should:

- Be small
- Be unobtrusive
- Reinforce social presence

---

## 9. Extension UX Principles

### **9.1 Overlay‑First**

The overlay must:

- Be self‑contained
- Avoid modifying the VTT
- Respect the host environment

### **9.2 Non‑Destructive**

The extension must never break:

- Token movement
- Map interaction
- VTT menus

### **9.3 Context‑Aware**

The overlay should adapt to:

- Scene changes
- Token selection
- DM actions

---

## 10. Error UX Principles

### **10.1 Errors Must Be Non‑Blocking**

Errors should never stop gameplay.

### **10.2 Errors Must Be Role‑Appropriate**

DMs see more detail than players.
Players see more detail than spectators.

### **10.3 Errors Must Be Recoverable**

Users should always be able to:

- Retry
- Reconnect
- Continue

---

## 11. Motion & Animation Principles

### **11.1 Motion Should Reinforce State**

Examples:

- Panel opening
- Message arrival
- Presence change

### **11.2 Motion Should Be Subtle**

Avoid:

- Bouncy animations
- Flashy transitions
- Excessive movement

### **11.3 Motion Should Be Fast**

Target durations:

- 120–180ms for small transitions
- 200–240ms for panel transitions

---

## 12. Summary

These UX Principles ensure that VTT‑Chat remains:

- Predictable
- Lightweight
- Role‑aware
- Privacy‑respecting
- Emotionally supportive of tabletop play

They are the foundation for every UI decision across the platform.

---

## 13. DM Experience Principles

### **13.1 The 2‑Click Rule**

Every DM action must be completable in ≤ 2 clicks or 1 drag.

If it takes more, the design has failed.

Examples:
- Drag a player to a new group: 1 drag
- Apply a condition: right-click → pick condition
- Change a group environment: click icon → pick environment
- Delete a group: click inline X

### **13.2 Controls Must Not Distract**

The DM is narrating, thinking three moves ahead, and managing five players simultaneously.

UI complexity is the enemy of good storytelling. Every extra click is a moment stolen from the table.

### **13.3 Power Without Complexity**

The system gives the DM enormous power — silencing players, scrambling voices, setting the mood of the room — but these powers must feel effortless.

The DM should feel like a wizard casting spells, not a sysadmin managing servers.

### **13.4 DM Actions Must Be Reversible**

Conditions can be cleared. Environments can be changed. Players can be moved back.

The system supports experimentation without fear of permanent damage.

---

## 14. Player Experience Principles

### **14.1 Players Must Know WHY**

Whenever the audio changes, the player must see a clear explanation in their AudioPanel:

- "Tavern environment — warm, reverberant"
- "Condition: Drunk — voice wobble active"
- "Silenced — only the DM can hear you"

Mystery is for the fiction. Not the interface.

### **14.2 Players Cannot Control DM Effects**

Environment and condition effects are DM-applied. Players can see them but not remove them.

This is intentional. The DM has authority over the table's experience.

### **14.3 The Silence Is the Joke**

When a player is silenced, they hear nothing unusual — but everyone else at the table stops hearing them. The ensuing chaos is the feature.

The UI must make this clear to the silenced player: "You are silenced. Only the DM can hear you."

### **14.4 Persistence Is Part of the Experience**

Players returning after two weeks should be able to see what notes were given to them last session, what handouts were shared, and what their character looks like in the system.

The app must remember so the players can focus on the story.

---

## 15. Greenroom UX Principles

### **15.1 Greenroom Is Pure Staging Space**

Greenroom is pre-show preparation space. It should remain uncluttered and calm.

### **15.2 DM Group Management Lives in Rightbar During Greenroom**

In greenroom state, the DM uses the rightbar Groups panel to create/configure groups. Group controls should not dominate the central greenroom staging experience.

### **15.3 Spectators Never See Greenroom**

Audience members do not see backstage activity. They wait for the show to begin.

---

## 16. Spectator Theatre Mode UX Principles

### **16.1 Session States Map to Theatre Semantics**

- `ACTIVE`: curtain up, spectators may observe public stage activity.
- `PAUSED`: intermission, curtain down, spectators see/hear nothing.
- `ENDED`: finale cooldown, public thank-you moment before backstage return.

### **16.2 Intermission Resets the Stage View**

On pause, players/DM return to `MAIN` with no active effects for stage prep. They are not moved to greenroom during intermission.

On resume, the curtain goes up and pre-intermission effects are restored.

### **16.3 Finale Cooldown Is Explicit and Configurable**

If spectators are enabled, session end enters a cooldown window (default 60 seconds, configurable in campaign settings).

During cooldown:

- Players/DM are in `MAIN` with no effects
- Spectators can interact via public voice/chat only
- DM can extend the cooldown before it expires

After cooldown expires, everyone exits to greenroom.

### **16.4 Cooldown Content Is Ephemeral**

Cooldown interactions are not included in session recording/history and are purged from session logs. Temporary visibility may exist only until greenroom cleanup runs.

---

## 17. Audio Effect UX Principles

### **17.1 Effects Are Listed, Not Hidden**

The AudioPanel shows every active effect as a labelled row with an icon and a short description.

No effect is silent. No effect is invisible.

### **17.2 Effect Order Is Predictable**

Effects display in this order:
1. PTT state (push-to-talk)
2. Environment (room ambiance)
3. Distance (proximity modifier)
4. Condition (DM-applied state like Drunk, Confused)
5. Voice preset (DM character voice)
6. In-character preset

### **17.3 Effects Clear Completely on Session End**

When a session ends or transitions to greenroom:
- All per-session conditions are cleared
- All voice presets are cleared
- All distance modifiers are cleared
- The current environment is cleared

Campaign-persistent environments (stored in `roomEnvironmentNames`) are preserved for next session.

### **17.4 Effects Restore Correctly on Reconnect**

On page refresh or reconnect, the server is the authoritative source. Audio state is re-hydrated from the audio state API before the local store is populated.

