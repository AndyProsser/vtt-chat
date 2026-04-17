# **ANIMATION-AND-MOTION-SPEC.md**

_A unified motion language for the VTT‑Chat command‑centre UI._

---

# 🎛️ 1. **Core Motion Principles**

### **1. Motion must communicate intent**

Every animation answers:
**“Why did this change?”**

### **2. Motion must be fast**

- 120–200ms for most transitions
- No long easing curves
- No bouncy, playful motion — this is a tactical UI

### **3. Motion must be subtle**

- Micro‑interactions
- Soft easing
- Minimal displacement

### **4. Motion must reinforce hierarchy**

- Panels slide
- Rails shift
- Chat stays anchored
- DM controls feel heavier than player controls

### **5. Motion must feel physical**

- Slight inertia
- Slight overshoot on drag
- Snap‑to‑place interactions

---

# 🧱 2. **Easing Curves**

These are the only curves used across the entire UI.

### **Primary UI Easing**

```
cubic-bezier(0.25, 0.1, 0.25, 1.0)
```

- Smooth
- Fast
- Professional
- Ideal for panels, rails, tabs

### **Micro‑interaction Easing**

```
cubic-bezier(0.33, 0.0, 0.67, 1.0)
```

- Snappy
- Used for buttons, toggles, icons

### **Drag‑and‑drop Easing**

```
cubic-bezier(0.2, 0.0, 0.0, 1.0)
```

- Slight inertia
- Feels physical

---

# 🧭 3. **Slide‑In Panels (Right Side)**

### **Panels:**

- Rooms
- Audio
- Search
- Notes
- Journal
- History
- Settings

### **Animation**

```
Duration: 180ms
Easing: primary
Transform: translateX(100%) → 0
Opacity: 0 → 1 (subtle, 0.85 → 1)
Shadow: fade in from 0 → 12px blur
```

### **Close Animation**

```
Duration: 140ms
Easing: primary
Transform: translateX(0) → 100%
Opacity: 1 → 0.85
Shadow: fade out
```

### **Chat Shift**

Chat shifts left by a fixed amount (panel width), not animated by size — only by transform.

```
Duration: 180ms
Transform: translateX(0 → -panelWidth)
```

---

# 👥 4. **Left Player Rail**

### **Expanded → Collapsed**

```
Duration: 160ms
Transform: width 240px → 64px
Opacity of text: 1 → 0
Avatar scale: 1.0 → 0.9
```

### **Collapsed → Expanded**

```
Duration: 180ms
Transform: width 64px → 240px
Opacity of text: 0 → 1
Avatar scale: 0.9 → 1.0
```

### **Player Item Hover**

```
Duration: 80ms
Background: darken by 4%
Scale: 1.0 → 1.02
```

### **Speaking Indicator Pulse**

```
Duration: 900ms
Easing: ease-in-out
Opacity: 0.4 → 1.0 → 0.4
```

---

# 🎙 5. **DM Voice Panel**

### **Open**

```
Duration: 140ms
Transform: translateY(-8px) → 0
Opacity: 0 → 1
```

### **Preset Button Press**

```
Duration: 80ms
Scale: 1.0 → 0.96 → 1.0
Glow: 0 → 1 (blue)
```

### **Clear All**

```
Duration: 120ms
Flash: red glow 0 → 1 → 0
```

---

# 💬 6. **Chat Window**

### **New Message**

```
Duration: 120ms
Transform: translateY(6px) → 0
Opacity: 0 → 1
```

### **System Message**

```
Duration: 100ms
Opacity: 0 → 1
```

### **Note Published**

```
Duration: 160ms
Border-left accent: fade in
Background: slight pulse (2% brightness)
```

---

# ⌨️ 7. **Message Composer**

### **Focus**

```
Duration: 120ms
Border: 1px → 2px (accent)
Shadow: subtle glow
```

### **Autocomplete Dropdown**

```
Duration: 120ms
Transform: translateY(-4px) → 0
Opacity: 0 → 1
```

### **Autocomplete Item Hover**

```
Duration: 80ms
Background: darken by 6%
```

---

# 🖱️ 8. **Right‑Click Menus**

### **Open**

```
Duration: 120ms
Transform: scale(0.96) → 1.0
Opacity: 0 → 1
Shadow: fade in
```

### **Menu Item Hover**

```
Duration: 80ms
Background: darken by 5%
```

---

# 🧲 9. **Drag‑and‑Drop Player Movement**

### **Pickup**

```
Duration: 80ms
Scale: 1.0 → 1.05
Shadow: 0 → 12px blur
```

### **Drag**

```
Cursor: grab
Transform follows pointer with 1–2px inertia
```

### **Drop Target Highlight**

```
Duration: 120ms
Background: accent glow (blue)
Border: 1px → 2px
```

### **Drop + Countdown**

```
Countdown numbers fade in/out (200ms each)
Color: accent blue
Scale: 1.0 → 1.1 → 1.0
```

---

# 🌫️ 10. **Environment Change (Room)**

### **Icon Update**

```
Duration: 160ms
Scale: 0.8 → 1.0
Opacity: 0 → 1
```

### **Room Background Pulse**

```
Duration: 200ms
Background: darken by 4% → normal
```

---

# 📝 11. **Notes Panel**

### **Open**

```
Duration: 180ms
Slide-in from right
Opacity: 0.85 → 1
```

### **Note Item Hover**

```
Duration: 80ms
Background: darken by 4%
```

### **Note Editor**

```
Duration: 140ms
Fade + slight scale (0.98 → 1.0)
```

---

# 📱 12. **Mobile Motion Rules**

### **Bottom Tabs**

```
Duration: 140ms
Opacity: 0 → 1
```

### **Slide‑Up Panels**

```
Duration: 200ms
Transform: translateY(100%) → 0
```

### **Swipe‑Open Left Rail**

```
Duration: 180ms
Transform: translateX(-100%) → 0
```

---

# 🧠 13. **Persona‑Specific Motion Weighting**

### **DM**

- Heavier shadows
- Slightly slower panel transitions (180ms)
- Stronger glow on active controls

### **Player**

- Lighter shadows
- Faster transitions (160ms)
- Softer glow

### **Spectator**

- No glow
- No scale animations
- Reduced motion (accessibility‑friendly)

---

# 🎮 14. **Motion Summary Table**

| Interaction        | Duration | Easing  | Notes            |
| ------------------ | -------- | ------- | ---------------- |
| Slide‑in panel     | 180ms    | primary | Chat shifts left |
| Left rail collapse | 160ms    | primary | Width animation  |
| DM voice panel     | 140ms    | primary | Subtle drop‑in   |
| New chat message   | 120ms    | micro   | Slide + fade     |
| Right‑click menu   | 120ms    | micro   | Scale + fade     |
| Drag pickup        | 80ms     | drag    | Lift + shadow    |
| Autocomplete       | 120ms    | micro   | Drop‑down fade   |
