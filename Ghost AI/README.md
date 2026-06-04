# Ghost AI — Quick Start Guide

## Setup (5 minutes)

### 1. Copy environment file
```bash
cp .env.example .env
```

### 2. Add your API key in `.env`
```env
OPENAI_API_KEY=sk-your-key-here
```
> Without a key, the app runs in **MOCK MODE** — great for testing!

### 3. Install dependencies
```bash
pnpm install
```

### 4. Start the core engine (Terminal 1)
```bash
pnpm dev:core
```

### 5. Start the overlay UI (Terminal 2)
```bash
pnpm dev:desktop
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Space` | Toggle overlay visibility |
| `Ctrl+Shift+A` | Start / Stop listening |
| `Ctrl+Shift+C` | Clear context |
| `Ctrl+Shift+M` | Cycle through modes |

---

## Modes

| Mode | Best For |
|------|----------|
| 💼 Interview | Job interviews, coding challenges |
| 🤝 Meeting | Business meetings, calls |
| 💻 Coding | Pair programming, debugging |
| 🌐 General | Everything else |

---

## How It Works

```
Mic → STT (Whisper) → Context Buffer → LLM → Overlay
```

1. Press `Ctrl+Shift+A` to start listening
2. Speak naturally
3. Transcript appears in overlay
4. AI generates suggestions every ~3 seconds
5. Press `Ctrl+Shift+Space` to hide when sharing screen

---

## Audio Setup

The app uses **SoX** for microphone capture.

**Install SoX on Windows:**
```powershell
winget install SoXFork.SoX
# OR install from: https://sox.sourceforge.net
```

Without SoX, the app runs in **mock audio mode** with simulated transcripts.

---

## Architecture

```
apps/
├── core-engine/          Node.js backend
│   └── src/
│       ├── index.ts      Main entry + pipeline wiring
│       ├── server.ts     Socket.IO server
│       ├── audio/        Audio capture pipeline
│       ├── stt/          Speech-to-text service
│       ├── context/      Rolling context buffer
│       ├── llm/          LLM orchestration
│       ├── monitor/      Screen share detection
│       └── utils/        EventBus, Logger
│
└── desktop/              Electron overlay app
    ├── src/
    │   ├── main.js       Electron main process
    │   └── preload.js    IPC bridge
    └── renderer/
        ├── index.html    UI structure
        ├── style.css     Glass UI styling
        └── renderer.js   UI logic + Socket client
```

---

## Stealth & Undetectability Guide

Ghost AI has built-in features to ensure it is **100% undetectable** by proctoring software (e.g. Proctorio, Mercer Mettl, HackerRank, Codility, Zoom/Teams screen capture).

### 1. Headless Remote-Only Mode (Recommended for high-stakes interviews)
If you run the application with a desktop overlay, proctoring tools could detect the `alwaysOnTop` transparent window or capture it on screen-share.

To bypass this entirely, run the app in **Headless Remote-Only Mode**:
- Spawns the backend engine but **creates no desktop GUI window/tray/overlay** on your screen.
- You interact with the app, edit configurations (Gemini Key, Resume, VAD), and read live transcripts/suggestions **entirely on your mobile phone or tablet browser**.

**How to run Headless Remote Mode:**
1. Start the services with the `--headless` argument:
   ```bash
   pnpm dev -- --headless
   ```
2. Find your computer's local network IP (e.g. `192.168.1.50`).
3. Open a browser on your phone/tablet and navigate to:
   ```
   http://<your-pc-ip>:3001/spy
   ```
4. Place your phone near your monitor. You will receive suggestions and transcripts in real-time, with zero trace on the interview computer.

### 2. Automated Process-Name Spoofing
Many proctors check your active processes for names like `electron.exe` or `node.exe`.
- Ghost AI automatically duplicates the Electron binary to a system-looking background task (`msedge_security_broker.exe`) in the node directory before launching.
- The overlay launches under the spoofed name, hiding `electron.exe` from process scans.
- The spoofed binary is dynamically cleaned up and deleted immediately upon quitting the application.

