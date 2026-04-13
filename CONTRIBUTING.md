# Contributing to VTT‑Chat

Thank you for your interest in contributing to **VTT‑Chat**!  
This project is an open, community‑friendly effort to build a **DM‑grade, session‑aware tabletop voice & chat platform** designed for home‑hosted D&D and TTRPG campaigns.

Whether you're fixing a bug, improving documentation, or implementing a new feature, your help is appreciated.

---

## 📘 Before You Begin

Please read the **Architecture & Knowledge Pack** for a full understanding of the system’s goals, behavior, and design philosophy:

👉 `docs/ARCHITECTURE.md`

This document explains:

- The audio engine (DM voice, conditions, environments)  
- Session boundaries & lazy‑loaded chat  
- Metadata cards & notes  
- Player privacy rules  
- LiveKit integration  
- HomeLab deployment model  
- Backend & SPA architecture  
- Persistence rules  
- Admin app concepts  

Understanding these concepts will help ensure contributions align with the project vision.

---

## 🐛 Reporting Issues

If you encounter a bug, unexpected behavior, or have a feature request:

👉 **Open an Issue:**  
`https://github.com/AndyProsser/vtt-chat/issues`

Please include:

- A clear description of the problem  
- Steps to reproduce (if applicable)  
- Expected vs actual behavior  
- Logs or screenshots (if helpful)  
- Your environment (browser, OS, server setup)

Issues are the best place to discuss ideas before submitting a pull request.

---

## 🔧 Pull Requests

### 1. Fork the repository  
Create your own fork and clone it locally.

### 2. Create a feature branch  
Use descriptive names:

```
feature/metadata-timeline
fix/audio-state-slideout
docs/update-readme
```

### 3. Follow project conventions  
- Use **TypeScript** for backend and frontend  
- Maintain strong typing  
- Keep backend modules small and focused  
- Follow React component patterns already in the SPA  
- Respect privacy rules (DM vs player capabilities)  
- Ensure session boundaries and visibility rules are preserved  
- Avoid introducing new system message types  
- Keep DM overrides session‑scoped  
- Keep player audio preferences persistent  

### 4. Write clear commit messages  
Use present tense and concise descriptions:

```
Add recap metadata card template
Fix DM mute override logic
Improve Caddy TLS config for non-standard ports
```

### 5. Ensure code builds & linting passes  
(Automated checks will be added as CI evolves.)

### 6. Submit a Pull Request  
Describe:

- What the PR does  
- Why it’s needed  
- Any architectural considerations  
- Any breaking changes  

PRs will be reviewed for:

- Code quality  
- Alignment with architecture  
- UX consistency  
- Security/privacy implications  
- Deployment impact  

---

## 🧪 Testing Expectations

As the project matures, automated tests will be added.  
For now:

- Test backend endpoints locally  
- Test SPA behavior in browser  
- Test LiveKit audio flows with at least two clients  
- Test session boundaries and lazy‑load behavior  
- Test DM vs player visibility rules  

If your change affects audio, metadata, or session logic, please test thoroughly.

---

## 🏗️ Project Structure (High‑Level)

```
/backend        → Node/TypeScript backend, WebSocket API, LiveKit token server
/frontend       → React SPA (DM & player UI)
/livekit        → LiveKit server config
/docker         → Docker & Caddy configs
/docs           → Architecture, deployment, knowledge pack
/scripts        → Installers, utilities
```

---

## 🛡️ Code of Conduct

Be respectful, constructive, and collaborative.  
This project is built for a community of DMs and players — let’s keep it welcoming.

A full `CODE_OF_CONDUCT.md` may be added later.

---

## ⚠️ Trademark Disclaimer

- **Dungeons & Dragons**, **D&D**, and related terms are trademarks of **Wizards of the Coast LLC**.  
- **LiveKit** is a trademark of **LiveKit, Inc.**  
- All other trademarks are property of their respective owners.  
- VTT‑Chat is **not affiliated** with Wizards of the Coast, LiveKit, or any other trademark holder.

This project is a **fan‑made, non‑commercial tool** intended to support tabletop role‑playing groups.

---

## 🤝 Thank You

Your contributions help make VTT‑Chat a powerful, flexible, and DM‑friendly platform for tabletop groups everywhere.  
Whether you're fixing a typo or implementing a major feature, your help is valued.
