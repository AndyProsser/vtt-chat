# **UX-PRINCIPLES.md**

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

# 1. Core UX Philosophy

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

# 2. Layout Principles

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

# 3. Interaction Principles

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

# 4. Role‑Based UX

---

## 4.1 DM UX

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

## 4.2 Player UX

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

## 4.3 Spectator UX

Spectators see:

- Read‑only chat
- Presence

Spectator UX must feel:

- Lightweight
- Passive
- Non‑interactive

---

# 5. Chat UX Principles

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

# 6. Notes UX Principles

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

# 7. Audio UX Principles

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

# 8. Presence UX Principles

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

# 9. Extension UX Principles

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

# 10. Error UX Principles

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

# 11. Motion & Animation Principles

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

# 12. Summary

These UX Principles ensure that VTT‑Chat remains:

- Predictable
- Lightweight
- Role‑aware
- Privacy‑respecting
- Emotionally supportive of tabletop play

They are the foundation for every UI decision across the platform.
