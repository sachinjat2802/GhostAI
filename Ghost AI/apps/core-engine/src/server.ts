import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { EventBus } from './utils/EventBus';
import { Logger } from './utils/Logger';

const logger = new Logger('EngineServer');

export class EngineServer {
  private app = express();
  private httpServer = createServer(this.app);
  private io: SocketIOServer;
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.io = new SocketIOServer(this.httpServer, {
      cors: { origin: '*' },
    });
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  private setupRoutes() {
    this.app.use(express.json());

    // Spy Mirror UI (Exact Desktop Clone for Mobile)
    this.app.get('/spy', (_req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <title>Ghost Remote Control</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            :root {
              --bg-glass: rgba(10, 10, 18, 0.98);
              --bg-panel: rgba(25, 25, 40, 0.9);
              --border: rgba(255, 255, 255, 0.1);
              --accent: #8b5cf6;
              --text-primary: rgba(255, 255, 255, 0.95);
              --text-muted: rgba(255, 255, 255, 0.4);
              --radius: 16px;
              --radius-sm: 12px;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Inter', sans-serif; background: #000; color: var(--text-primary); height: 100dvh; overflow: hidden; }
            
            #app {
              background: var(--bg-glass);
              height: 100dvh;
              display: flex;
              flex-direction: column;
              border: none;
              position: relative;
            }

            .header { padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); flex-shrink: 0; }
            .header-left { display: flex; align-items: center; gap: 10px; }
            .app-name { font-weight: 700; font-size: 14px; color: #fff; }
            .mode-badge { font-size: 9px; font-weight: 800; text-transform: uppercase; color: var(--accent); background: rgba(139, 92, 246, 0.1); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(139,92,246,0.2); }

            .main-scrollable { flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding-bottom: 180px; }
            .panel { margin: 10px 12px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-sm); display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
            .panel-label { padding: 8px 12px; font-size: 9px; font-weight: 800; color: var(--text-muted); border-bottom: 1px solid var(--border); letter-spacing: 1.2px; }
            .panel-content { padding: 12px 15px; font-size: 14px; line-height: 1.6; }
            
            #transcript-panel { min-height: 80px; }

            .chat-bar { padding: 14px; display: flex; gap: 10px; background: rgba(0,0,0,0.4); border-top: 1px solid var(--border); flex-shrink: 0; }
            input { flex: 1; background: rgba(255,255,255,0.08); border: 1px solid var(--border); border-radius: 10px; color: #fff; padding: 12px; font-size: 15px; outline: none; }
            
            .controls { padding: 14px 14px calc(14px + env(safe-area-inset-bottom)); background: rgba(10,10,18,0.95); backdrop-filter: blur(20px); border-top: 1px solid var(--border); display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; position: fixed; bottom: 0; width: 100%; z-index: 1000; }
            button, select { background: rgba(255,255,255,0.1); border: 1px solid var(--border); color: #fff; padding: 14px; border-radius: 12px; font-weight: 700; font-size: 13px; outline: none; -webkit-appearance: none; }
            .btn-accent { background: var(--accent); border: none; box-shadow: 0 4px 15px var(--accent-glow); }
            .btn-clear { border-color: rgba(239, 68, 68, 0.3); color: #ef4444; }

            .chat-msg { margin-bottom: 10px; padding: 12px; border-radius: 12px; max-width: 95%; font-size: 14px; }
            .ai-msg { background: rgba(139,92,246,0.12); border: 1px solid rgba(139,92,246,0.2); align-self: flex-start; }
            .user-msg { background: rgba(255,255,255,0.06); align-self: flex-end; margin-left: auto; color: rgba(255,255,255,0.6); }

            #status-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
          </style>
        </head>
        <body>
          <div id="app">
            <div class="header">
              <div class="header-left">
                <span style="font-size: 18px;">👻</span>
                <div style="display: flex; flex-direction: column;">
                  <span class="app-name">Ghost AI Remote</span>
                  <span class="mode-badge" id="mode-badge">interview</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 12px;">
                <button onclick="toggleSettings()" style="background:none; border:none; font-size:18px; color:#fff; outline:none; cursor:pointer;">⚙️</button>
                <div id="status-dot" style="box-shadow: 0 0 10px #10b981;"></div>
              </div>
            </div>

            <!-- Settings Panel (Sliding overlay) -->
            <div id="settings-panel" style="position:fixed; top:50px; bottom:0; left:0; right:0; background:rgba(10,10,18,0.98); border-top:1px solid var(--border); display:none; flex-direction:column; padding:16px; gap:12px; z-index:1000; overflow-y:auto; box-sizing:border-box;">
              <div style="font-size:16px; font-weight:700; color:#fff; border-bottom:1px solid var(--border); padding-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <span>⚙️ Settings</span>
                <button onclick="toggleSettings()" style="background:none; border:none; font-size:24px; color:#fff; outline:none; cursor:pointer;">×</button>
              </div>
              <div style="display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Gemini API Key</label>
                <input type="password" id="setting-gemini-key" placeholder="Enter Gemini API Key..." style="background:rgba(255,255,255,0.06); border:1px solid var(--border); color:#fff; padding:10px; border-radius:8px; font-size:13px; outline:none; width:100%; box-sizing:border-box;" />
              </div>
              <div style="display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Candidate Resume / Context</label>
                <textarea id="setting-resume" placeholder="Paste your resume here..." style="background:rgba(255,255,255,0.06); border:1px solid var(--border); color:#fff; padding:10px; border-radius:8px; font-size:12px; height:120px; resize:none; font-family:inherit; outline:none; width:100%; box-sizing:border-box; line-height:1.5;"></textarea>
              </div>
              <div style="display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">VAD Sensitivity (Mic Gate): <span id="vad-sensitivity-label">0.015</span></label>
                <input type="range" id="setting-vad-sensitivity" min="0.005" max="0.05" step="0.005" value="0.015" oninput="updateVadLabel(this.value)" style="width:100%; accent-color:var(--accent); outline:none;" />
              </div>
              <button onclick="saveSettings()" style="background:var(--accent); border:none; color:#fff; padding:12px; border-radius:8px; font-weight:700; cursor:pointer; margin-top:8px; font-size:13px; box-shadow:0 4px 15px rgba(139,92,246,0.3);">Save & Apply</button>
            </div>

            <div class="main-scrollable">
              <div class="panel" id="transcript-panel">
                <div class="panel-label">🎙️ LIVE TRANSCRIPT</div>
                <div class="panel-content" id="transcript-content">Listening...</div>
              </div>

              <div class="panel" id="suggestion-panel">
                <div class="panel-label" id="suggestion-label">🧠 AI ANSWER</div>
                <div class="panel-content" id="suggestion-content" style="display: flex; flex-direction: column;">
                  ...
                </div>
              </div>
            </div>

            <div style="position: fixed; bottom: 0; left: 0; right: 0; display: flex; flex-direction: column; z-index: 999;">
              <div class="chat-bar" id="chat-bar" style="display:none">
                <input type="text" id="chat-input" placeholder="Quick follow-up...">
                <button onclick="sendChat()" style="width: 50px; background: var(--accent); border:none; font-size: 20px;">⏎</button>
              </div>

              <div class="controls">
                <button id="btn-listen" class="btn-accent" onclick="toggleListening()">Start</button>
                <button id="btn-solve" style="display:none; background: #06b6d4; border:none;" onclick="sendCommand('capture-screen')">📸 Solve</button>
                <button onclick="sendCommand('toggle-visibility')" style="border-color: #666; font-size: 11px; padding: 10px 5px;">🕵️ Hide PC</button>
                <button class="btn-clear" style="font-size: 11px; padding: 10px 5px;" onclick="sendCommand('clear-context')">Clear</button>
                <select id="mode-select" style="grid-column: span 4; margin-top: 5px;" onchange="sendCommand('set-mode', this.value)">
                  <option value="interview">💼 Interview</option>
                  <option value="meeting">🤝 Meeting</option>
                  <option value="coding">💻 Coding</option>
                  <option value="general">🌐 General</option>
                </select>
              </div>
            </div>
          </div>

          <script src="/socket.io/socket.io.js"></script>
          <script>
            const socket = io();
            const transcript = document.getElementById('transcript-content');
            const suggestion = document.getElementById('suggestion-content');
            const modeBadge = document.getElementById('mode-badge');
            const btnListen = document.getElementById('btn-listen');
            const btnSolve = document.getElementById('btn-solve');
            const chatBar = document.getElementById('chat-bar');
            const chatInput = document.getElementById('chat-input');
            const modeSelect = document.getElementById('mode-select');
            const suggestLabel = document.getElementById('suggestion-label');

            let isListening = false;
            let currentMode = 'interview';

            socket.on('ui:transcript', (text) => {
              if (currentMode === 'general') return;
              transcript.textContent = text;
              transcript.scrollTop = transcript.scrollHeight;
            });

            socket.on('ui:suggestion', (text) => {
              appendMsg(text, 'ai');
            });

            socket.on('mode-changed', (mode) => {
              currentMode = mode;
              modeBadge.textContent = mode;
              modeSelect.value = mode;
              updateUI(mode);
            });

            function updateUI(mode) {
              const transcriptPanel = document.getElementById('transcript-panel');
              transcriptPanel.style.display = (mode === 'coding' || mode === 'general') ? 'none' : 'flex';
              btnSolve.style.display = (mode === 'coding') ? 'block' : 'none';
              btnListen.style.display = (mode === 'general') ? 'none' : 'block';
              chatBar.style.display = (mode === 'general' || mode === 'coding') ? 'flex' : 'none';
              suggestLabel.textContent = (mode === 'general' || mode === 'coding') ? '💬 CHAT HISTORY' : '🧠 AI ANSWER';
            }

            function formatSuggestion(text) {
              return text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/^[•\-] (.+)/gm, '<div style="padding-left:10px;">• $1</div>')
                .replace(/\n\n/g, '<br><br>')
                .replace(/\n/g, '<br>');
            }

            function appendMsg(text, role) {
              const div = document.createElement('div');
              div.className = 'chat-msg ' + (role === 'ai' ? 'ai-msg' : 'user-msg');
              div.innerHTML = formatSuggestion(text);
              suggestion.appendChild(div);
              suggestion.scrollTop = suggestion.scrollHeight;
            }

            function toggleListening() {
              isListening = !isListening;
              sendCommand(isListening ? 'start-listening' : 'stop-listening');
              btnListen.textContent = isListening ? 'Stop' : 'Start';
              btnListen.style.background = isListening ? '#ef4444' : '#8b5cf6';
            }

            function sendChat() {
              const val = chatInput.value.trim();
              if(!val) return;
              chatInput.value = '';
              appendMsg(val, 'user');
              sendCommand('inject-transcript', val);
            }

            function sendCommand(type, payload) {
              socket.emit('command', { type, payload });
            }

            // Settings Management
            let vadThreshold = 0.015;
            
            function toggleSettings() {
              const panel = document.getElementById('settings-panel');
              panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'flex' : 'none';
            }
            
            function updateVadLabel(val) {
              document.getElementById('vad-sensitivity-label').textContent = parseFloat(val).toFixed(3);
              vadThreshold = parseFloat(val);
            }
            
            function loadSettings() {
              const apiKey = localStorage.getItem('gemini_api_key') || '';
              const resume = localStorage.getItem('candidate_resume') || '';
              const vad = localStorage.getItem('vad_sensitivity') || '0.015';
              
              document.getElementById('setting-gemini-key').value = apiKey;
              document.getElementById('setting-resume').value = resume;
              document.getElementById('setting-vad-sensitivity').value = vad;
              updateVadLabel(vad);
            }
            
            function saveSettings() {
              const apiKey = document.getElementById('setting-gemini-key').value.trim();
              const resume = document.getElementById('setting-resume').value.trim();
              const vad = document.getElementById('setting-vad-sensitivity').value;
              
              localStorage.setItem('gemini_api_key', apiKey);
              localStorage.setItem('candidate_resume', resume);
              localStorage.setItem('vad_sensitivity', vad);
              updateVadLabel(vad);
              
              socket.emit('settings-sync', {
                apiKey,
                resume,
                vadThreshold: parseFloat(vad)
              });
              
              toggleSettings();
            }
            
            socket.on('settings-sync', (settings) => {
              if (settings.apiKey !== undefined) localStorage.setItem('gemini_api_key', settings.apiKey);
              if (settings.resume !== undefined) localStorage.setItem('candidate_resume', settings.resume);
              if (settings.vadThreshold !== undefined) localStorage.setItem('vad_sensitivity', settings.vadThreshold);
              loadSettings();
            });
            
            // load on start
            loadSettings();
          </script>
        </body>
        </html>
      `);
    });

    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', service: 'ghost-ai-core', timestamp: Date.now() });
    });

    // REST fallback for commands
    this.app.post('/command', (req, res) => {
      const { type, payload } = req.body;
      this.eventBus.emit(`command:${type}`, payload);
      res.json({ ok: true });
    });
  }

  private setupSocketHandlers() {
    // 1. Forward events from EventBus → ALL connected clients
    const forwardToAll = [
      'ui:transcript',
      'ui:suggestion',
      'overlay:hide',
      'overlay:show',
      'context:cleared',
      'mode-changed',
    ];

    forwardToAll.forEach((event) => {
      this.eventBus.on(event, (data: any) => {
        this.broadcast(event, data);
      });
    });

    // 2. Handle connections
    this.io.on('connection', (socket) => {
      logger.info(`🔗 Client connected: ${socket.id}`);

      // Forward commands from client → Engine
      socket.on('command', ({ type, payload }: { type: string; payload: any }) => {
        logger.debug(`→ Command from ${socket.id}: ${type}`, payload);
        this.eventBus.emit(`command:${type}`, payload);
        // Sync OTHER clients (e.g. phone → desktop sync)
        this.broadcast('command', { type, payload });
      });

      // Receive raw PCM audio chunks from client
      socket.on('audio-chunk', (data: any) => {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        this.eventBus.emit('audio:chunk', buffer);
      });

      // Receive settings sync from client
      socket.on('settings-sync', (settings: any) => {
        logger.info(`⚙️ Settings sync: API Key: ${settings.apiKey ? 'Set' : 'Empty'}, Resume len: ${settings.resume?.length || 0}`);
        this.eventBus.emit('settings:sync', settings);
        // Sync OTHER clients (e.g. sync phone to desktop or vice versa)
        socket.broadcast.emit('settings-sync', settings);
      });

      socket.on('disconnect', () => {
        logger.info(`🔌 Client disconnected: ${socket.id}`);
      });
    });
  }

  broadcast(event: string, data: any) {
    this.io.emit(event, data);
  }

  async start() {
    const port = parseInt(process.env.ENGINE_PORT || '3001');
    return new Promise<void>((resolve) => {
      this.httpServer.listen(port, () => {
        logger.info(`📡 Engine server listening on port ${port}`);
        resolve();
      });
    });
  }
}
