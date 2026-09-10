# 👻 Ghost AI — Real-Time Invisible Teleprompter & AI Assistant

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![Version: 1.0.0](https://img.shields.io/badge/Version-1.0.0-blue.svg)](package.json)
[![Platform: Windows | Mobile](https://img.shields.io/badge/Platform-Windows%20%7C%20Mobile-green.svg)](#-mobile-spy-mode-spy)
[![Build Status](https://img.shields.io/badge/Build-Passing-success.svg)](#-building-the-windows-installer-exe)

> **Ghost AI** is an ultra-low latency, real-time invisible AI assistant and teleprompter built for live job interviews, technical pair programming, high-stakes meetings, and automated OCR problem solving.

---

## 📚 Complete Technical Documentation

- 📐 **[High Level Design (HLD)](file:///d:/Ghost%20AI/Ghost%20AI/docs/HLD.md)** — Core architecture, system topology, microservices, and sequence diagrams.
- 🔬 **[Low Level Design (LLD)](file:///d:/Ghost%20AI/Ghost%20AI/docs/LLD.md)** — Class specifications, memory heap budgets, and circular ring buffer mechanics.
- ⚡ **[System Architecture](file:///d:/Ghost%20AI/Ghost%20AI/docs/ARCHITECTURE.md)** — EventBus pub/sub, monorepo breakdown, anti-detection matrix, and process masking.
- 📡 **[API & Protocol Spec](file:///d:/Ghost%20AI/Ghost%20AI/docs/API_AND_PROTOCOLS.md)** — Socket.IO real-time events, REST endpoints, and binary PCM frame protocols.
- 🚀 **[Performance & 200 Optimizations](file:///d:/Ghost%20AI/Ghost%20AI/docs/PERFORMANCE_AND_OPTIMIZATIONS.md)** — Comprehensive guide on time/space complexity refactorings, AudioWorklets, and GPU visualizers.
- 💡 **[100 Future Innovations](file:///d:/Ghost%20AI/Ghost%20AI/docs/100_FUTURE_OPTIMIZATIONS.md)** — Comprehensive roadmap of 100 next-level optimizations and futuristic features.

---

## 🚀 Quick Start Guide

### 1. Copy Environment Configuration
```bash
cp .env.example .env
```

### 2. Configure Environment Variables
Edit `.env` to include your Gemini API key:
```env
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL=gemini-3.5-flash-lite
ENGINE_PORT=3001
```

### 3. Install Dependencies
```bash
pnpm install
```

### 4. Run Development Environment
To launch both Core Engine and Electron Desktop Overlay concurrently:
```bash
pnpm dev
```

Or run services individually:
```bash
# Core Engine only (Port 3001)
pnpm dev:core

# Desktop Overlay UI only
pnpm dev:desktop
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Ctrl+Shift+Space` | **Toggle Visibility** | Show or hide the desktop overlay instantly |
| `Ctrl+Shift+K` | **Click-Through Mode** | Mouse clicks pass directly to background apps |
| `Ctrl+Shift+A` | **Start / Stop Audio** | Toggle real-time microphone & loopback capture |
| `Ctrl+Shift+S` | **Screen OCR Solve** | Capture screen region and solve coding/math questions |
| `Ctrl+Shift+C` | **Clear Context** | Flush transcript & LLM answer history |
| `Ctrl+Shift+M` | **Cycle Modes** | Switch between Interview, Meeting, Coding, and General |
| `Ctrl+Shift+T` | **Text-Only Mode** | Minimal teleprompter mode without container background |
| `Ctrl+Shift+H` | **Stealth Opacity** | Toggle overlay opacity (0.1 / 0.5 / 1.0) |

---

## 🎯 Assistant Modes

| Mode | Target Use Case | AI Behavior |
|------|-----------------|-------------|
| 💼 **Interview** | Live job interviews, STAR responses | 1st-person answers tailored to candidate resume & target job description |
| 🤝 **Meeting** | Business meetings & discussions | Real-time bulleted summaries, action items, and key decisions |
| 💻 **Coding** | LeetCode, HackerRank, Pair Programming | Direct code solutions with Time & Space complexity analysis |
| 🌐 **General** | Instant AI assistant chat | Multi-turn direct conversational assistant |

---

## 📱 Mobile Spy Mode (`/spy`)

Ghost AI includes a built-in Mobile Teleprompter Mode that runs on any phone or tablet browser:

1. Connect your mobile device to the same Wi-Fi network.
2. Open phone browser and go to `http://<your-pc-ip>:3001/spy` (or scan the QR code in Settings ⚙️).
3. Live transcripts and AI teleprompter suggestions stream to your phone in real-time.

---

## 🛡️ Undetectability & Anti-Detection Architecture

Ghost AI is designed from the ground up for 100% stealth:

1. **Black Box Shield (`setContentProtection`)**:
   Enforces OS-level window protection, rendering the overlay invisible to screen share tools (Google Meet, Zoom, Teams, Webex).
2. **Headless Remote Mode**:
   Run with `pnpm dev -- --headless` to launch the engine without any desktop GUI/tray window. View suggestions on your mobile phone with zero process trace on the interview PC.
3. **Process Masking**:
   Electron binary is masked under system-style process names (`msedge_security_broker.exe`) to defeat process scanners.

---

## 📦 Building the Windows Installer (`.exe`)

To package Ghost AI into a standalone Windows installer (`Ghost AI Setup 1.0.0.exe`):

```bash
# Build desktop NSIS installer (.exe)
pnpm --filter ghost-ai-desktop build:nsis

# Build portable executable (.exe)
pnpm --filter ghost-ai-desktop build:portable
```

Built executables are generated in: `apps/desktop/dist/Ghost AI Setup 1.0.0.exe`

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
