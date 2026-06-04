/**
 * Ghost AI Renderer — Overlay UI Logic
 * Connects to core-engine via Socket.IO WebSocket
 */

const { ipcRenderer } = require('electron');
const io = require('socket.io-client');

// ============ STATE ============
let socket = null;
let isListening = false;
let isConnected = false;
let isStealth = false;
let isTextOnly = false;
let currentMode = 'interview';
const ENGINE_URL = 'http://localhost:3001';
const appContainer = document.getElementById('app');

// ============ AUDIO STATE ============
let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let audioSourceNode = null;

// ============ DOM REFS ============
const statusDot = document.getElementById('status-dot');
const transcriptText = document.getElementById('transcript-text');
const transcriptEmpty = document.getElementById('transcript-empty');
const suggestionText = document.getElementById('suggestion-text');
const suggestionEmpty = document.getElementById('suggestion-empty');
const btnListen = document.getElementById('btn-listen');
const btnListenLabel = document.getElementById('btn-listen-label');
const modeBadge = document.getElementById('mode-badge');
const audioBars = document.getElementById('audio-bars');
const thinkingDots = document.getElementById('thinking-dots');
const screenshareWarning = document.getElementById('screenshare-warning');
const customSelect = document.getElementById('custom-select');
const selectSelected = document.getElementById('select-selected');
const selectItems = document.getElementById('select-items');
const aiPanelLabel = document.getElementById('ai-panel-label');
const chatInputContainer = document.getElementById('chat-input-container');
const chatInput = document.getElementById('chat-input');
const btnCapture = document.getElementById('btn-capture');
const transcriptPanel = document.getElementById('transcript-panel');

// ============ SOCKET CONNECTION ============
function connect() {
  console.log('🔌 Connecting to Ghost AI Core Engine...');

  socket = io(ENGINE_URL, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: Infinity,
    timeout: 5000,
  });

  socket.on('connect', () => {
    console.log('✅ Connected to core engine');
    isConnected = true;
    setStatus('connected');
    showToast('Core engine connected', 'success');
    
    // Sync settings on connection
    const apiKey = localStorage.getItem('gemini_api_key') || '';
    const resume = localStorage.getItem('candidate_resume') || '';
    const autoHide = localStorage.getItem('auto_hide') === 'true';
    socket.emit('settings-sync', { apiKey, resume, autoHide });
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected from core engine');
    isConnected = false;
    setStatus('disconnected');
    setListening(false);
  });

  socket.on('connect_error', (err) => {
    console.warn('Connection error:', err.message);
    setStatus('disconnected');
  });

  // ---- Engine Events ----

  socket.on('ui:transcript', (text) => {
    updateTranscript(text);
    showThinking();
  });

  socket.on('ui:suggestion', (text) => {
    appendChatMessage(text, 'ai');
    hideThinking();
  });

  socket.on('overlay:hide', () => {
    screenshareWarning.style.display = 'flex';
    setTimeout(() => {
      try { ipcRenderer.send('hide-window'); } catch(e) {}
    }, 500);
  });

  socket.on('overlay:show', () => {
    screenshareWarning.style.display = 'none';
  });

  socket.on('context:cleared', () => {
    clearUI();
    showToast('Context cleared', 'info');
  });

  socket.on('settings-sync', (settings) => {
    if (settings.apiKey !== undefined) localStorage.setItem('gemini_api_key', settings.apiKey);
    if (settings.resume !== undefined) localStorage.setItem('candidate_resume', settings.resume);
    if (settings.autoHide !== undefined) localStorage.setItem('auto_hide', settings.autoHide);
    if (settings.vadThreshold !== undefined) localStorage.setItem('vad_sensitivity', settings.vadThreshold);
    loadSettings();
  });

  socket.on('mode-changed', (mode) => {
    console.log('🔄 Mode sync from engine:', mode);
    changeMode(mode);
  });

  socket.on('command', (cmd) => {
    console.log('🕹️ Remote command:', cmd);
    // cmd is { type, payload }
    switch(cmd.type) {
      case 'start-listening': setListening(true); break;
      case 'stop-listening': setListening(false); break;
      case 'clear-context': clearContext(); break;
    }
  });
}

// ============ UI UPDATES ============
function updateTranscript(text) {
  transcriptEmpty.style.display = 'none';
  transcriptText.style.display = 'block';

  // Keep rolling transcript (last 3 "sentences")
  const current = transcriptText.textContent || '';
  const words = (current + ' ' + text).trim().split(/\s+/);
  const trimmed = words.slice(-60).join(' '); // keep last 60 words
  transcriptText.textContent = '…' + trimmed;

  // Auto-scroll
  transcriptText.parentElement.scrollTop = transcriptText.parentElement.scrollHeight;
}

function appendChatMessage(text, role) {
  suggestionEmpty.style.display = 'none';
  suggestionText.style.display = 'flex';

  const entry = document.createElement('div');
  entry.className = `chat-msg ${role}-msg animate`;
  
  const fontSize = localStorage.getItem('overlay_font_size') || '13';
  entry.style.fontSize = fontSize + 'px';

  if (role === 'ai') {
    entry.innerHTML = `
      <div class="msg-body">${formatSuggestion(text)}</div>
      <button class="copy-btn" onclick="copyText(this)" title="Copy to clipboard">📋 Copy</button>
    `;
  } else {
    entry.innerHTML = formatSuggestion(text);
  }
  
  suggestionText.appendChild(entry);
  suggestionText.parentElement.scrollTop = suggestionText.parentElement.scrollHeight;
}

function formatSuggestion(text) {
  // Convert markdown-style bullets to HTML
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[•\-] (.+)/gm, '<div class="bullet">• $1</div>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function clearUI() {
  transcriptText.textContent = '';
  transcriptText.style.display = 'none';
  transcriptEmpty.style.display = 'flex';

  suggestionText.innerHTML = '';
  suggestionText.style.display = 'none';
  suggestionEmpty.style.display = 'flex';
}

function setStatus(state) {
  statusDot.className = 'status-dot';
  if (state === 'connected') statusDot.classList.add('connected');
  if (state === 'listening') statusDot.classList.add('listening');
}

function showThinking() {
  thinkingDots.style.display = 'flex';
}

function hideThinking() {
  thinkingDots.style.display = 'none';
}

function showToast(message, type = 'info') {
  // Simple console for now — could add a toast UI element
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// ============ CONTROLS ============
function toggleListening() {
  if (!isConnected) {
    showToast('Not connected to core engine', 'error');
    return;
  }
  setListening(!isListening);
}

function setListening(val) {
  isListening = val;
  if (isListening) {
    startFrontendAudio();
    btnListen.classList.add('active');
    btnListenLabel.textContent = 'Stop';
    audioBars.classList.add('active');
    setStatus('listening');
  } else {
    stopFrontendAudio();
    btnListen.classList.remove('active');
    btnListenLabel.textContent = 'Start';
    audioBars.classList.remove('active');
    setStatus(isConnected ? 'connected' : 'disconnected');
  }
}

function clearContext() {
  if (socket) socket.emit('command', { type: 'clear-context' });
  clearUI();
}

function changeMode(mode) {
  if (currentMode === mode && modeBadge.textContent.toLowerCase() === mode.toLowerCase()) return;
  
  currentMode = mode;
  modeBadge.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);

  // Update dropdown label if exists
  const modeLabels = {
    interview: '💼 Interview',
    meeting: '🤝 Meeting',
    coding: '💻 Coding',
    general: '🌐 General'
  };
  if (selectSelected) selectSelected.textContent = modeLabels[mode] || mode;

  // Toggle mode-specific UI
  if (mode === 'general') {
    aiPanelLabel.textContent = 'AI CHAT';
    chatInputContainer.style.display = 'flex';
    transcriptPanel.style.display = 'none';
    btnCapture.style.display = 'none';
    btnListen.style.display = 'none';
  } else if (mode === 'coding') {
    aiPanelLabel.textContent = 'CHAT / SOLUTION';
    chatInputContainer.style.display = 'flex';
    transcriptPanel.style.display = 'none';
    btnCapture.style.display = 'flex';
    btnListen.style.display = 'none';
  } else {
    aiPanelLabel.textContent = 'AI ANSWER';
    chatInputContainer.style.display = 'none';
    transcriptPanel.style.display = 'block';
    btnCapture.style.display = 'none';
    btnListen.style.display = 'flex';
  }

  if (socket && socket.connected) {
    socket.emit('command', { type: 'set-mode', payload: mode });
  }
}

function toggleDropdown() {
  selectItems.classList.toggle('select-hide');
}

function selectMode(event, mode, label) {
  event.stopPropagation();
  selectSelected.textContent = label;
  selectItems.classList.add('select-hide');
  changeMode(mode);
}

// Close the dropdown if the user clicks outside of it
document.addEventListener('click', function(event) {
  if (customSelect && !customSelect.contains(event.target)) {
    selectItems.classList.add('select-hide');
  }
});

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  showThinking();
  
  appendChatMessage(text, 'user');
  
  if (socket) {
    socket.emit('command', { type: 'inject-transcript', payload: text });
  }
}

async function captureScreen() {
  showToast('Capturing screen...', 'info');
  showThinking();
  try {
    // Request screenshot from main process
    ipcRenderer.send('capture-screen');
  } catch (err) {
    showToast('Capture failed', 'error');
  }
}

// Receive captured image (base64) from main process
ipcRenderer.on('screen-captured', (_, base64Image) => {
  if (socket) {
    socket.emit('command', { type: 'analyze-image', payload: base64Image });
  }
});

// ============ KEYBOARD COMMANDS FROM MAIN PROCESS ============
ipcRenderer.on('command', (_, command) => {
  switch (command) {
    case 'start-listening':
      setListening(true);
      break;
    case 'stop-listening':
      setListening(false);
      break;
    case 'clear-context':
      clearContext();
      break;
    case 'toggle-stealth':
      toggleStealth();
      break;
    case 'toggle-text-only':
      toggleTextOnly();
      break;
  }
});

function toggleTextOnly() {
  isTextOnly = !isTextOnly;
  if (isTextOnly) {
    appContainer.classList.add('text-only-mode');
    showToast('Text-only mode ON (No box)', 'info');
  } else {
    appContainer.classList.remove('text-only-mode');
    showToast('Text-only mode OFF', 'info');
  }
}

function toggleStealth() {
  isStealth = !isStealth;
  if (isStealth) {
    appContainer.classList.add('stealth-mode');
    showToast('Stealth mode ON (0.1 opacity)', 'info');
  } else {
    appContainer.classList.remove('stealth-mode');
    showToast('Stealth mode OFF', 'info');
  }
}

ipcRenderer.on('mode-changed', (_, mode) => {
  currentMode = mode;
  const modeLabels = {
    interview: '💼 Interview',
    meeting: '🤝 Meeting',
    coding: '💻 Coding',
    general: '🌐 General'
  };
  if (selectSelected) selectSelected.textContent = modeLabels[mode] || mode;
  changeMode(mode);
});

// ============ DRAG REGION ============
// Allow window dragging via header
document.getElementById('btn-minimize').addEventListener('click', () => {
  try { ipcRenderer.send('toggle-visibility'); } catch(e) {}
});

// ============ VAD & AUDIO VISUALIZER STATE ============
let speechBuffer = [];
let isSpeaking = false;
let silenceTimer = null;
let speechDuration = 0;
const SILENCE_GAP_MS = 1000;
const MAX_SPEECH_DURATION_MS = 8000;
let vadThreshold = 0.015;

function updateVadLabel(val) {
  const rounded = parseFloat(val).toFixed(3);
  document.getElementById('vad-sensitivity-label').textContent = rounded;
  vadThreshold = parseFloat(val);
}

function toggleVadSliderVisibility(source) {
  const vadGroup = document.getElementById('setting-group-vad');
  if (vadGroup) {
    vadGroup.style.display = source === 'mock' ? 'none' : 'flex';
  }
}

function updateAudioVisualizer(rms) {
  const bars = document.querySelectorAll('#audio-bars .bar');
  if (bars.length === 0) return;
  
  const minHeight = 4;
  const maxHeight = 14;
  const scale = 1200;
  const targetHeight = minHeight + (rms * scale);
  
  bars.forEach((bar, index) => {
    const phase = Math.sin(Date.now() / 150 + index) * 3;
    const height = Math.max(minHeight, Math.min(maxHeight, targetHeight + phase));
    bar.style.height = `${height}px`;
    bar.style.opacity = isListening ? '1' : '0.4';
  });
}

function sendSpeechBuffer() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  
  if (speechBuffer.length > 0) {
    let totalLength = 0;
    for (let i = 0; i < speechBuffer.length; i++) {
      totalLength += speechBuffer[i].length;
    }
    
    const combinedPcm = new Int16Array(totalLength);
    let offset = 0;
    for (let i = 0; i < speechBuffer.length; i++) {
      combinedPcm.set(speechBuffer[i], offset);
      offset += speechBuffer[i].length;
    }
    
    if (socket && socket.connected) {
      console.log(`🎙️ Sending VAD-buffered audio chunk: ${combinedPcm.length} samples (${(combinedPcm.length / 16000).toFixed(2)}s)`);
      socket.emit('audio-chunk', combinedPcm.buffer);
    }
  }
  
  speechBuffer = [];
  isSpeaking = false;
  speechDuration = 0;
}

// ============ AUDIO PIPELINE ============
async function startFrontendAudio() {
  const sourceVal = document.getElementById('setting-audio-source').value;
  if (sourceVal === 'mock') {
    socket.emit('command', { type: 'start-listening' });
    return;
  }

  try {
    let stream;
    if (sourceVal === 'mic') {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } else if (sourceVal === 'system') {
      const sources = await ipcRenderer.invoke('get-desktop-sources');
      const screenSource = sources.find(s => s.name.toLowerCase().includes('screen') || s.name.toLowerCase().includes('display') || s.name.toLowerCase().includes('entire')) || sources[0];
      if (!screenSource) {
        showToast('No screen source found for system audio capture', 'error');
        setListening(false);
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSource.id
          }
        },
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSource.id,
            maxWidth: 10,
            maxHeight: 10,
            maxFrameRate: 1
          }
        }
      });
    }

    mediaStream = stream;
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    audioSourceNode = audioContext.createMediaStreamSource(stream);
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    
    audioSourceNode.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    scriptProcessor.onaudioprocess = (e) => {
      if (!isListening) return;
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate RMS volume level
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      
      // Drive the visualizer
      updateAudioVisualizer(rms);
      
      // Convert to Int16 PCM
      const pcmChunk = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmChunk[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // VAD logic
      if (rms > vadThreshold) {
        isSpeaking = true;
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
        speechBuffer.push(pcmChunk);
        speechDuration += (inputData.length / 16000) * 1000;
        
        if (speechDuration >= MAX_SPEECH_DURATION_MS) {
          sendSpeechBuffer();
        }
      } else {
        if (isSpeaking) {
          speechBuffer.push(pcmChunk);
          if (!silenceTimer) {
            silenceTimer = setTimeout(() => {
              sendSpeechBuffer();
            }, SILENCE_GAP_MS);
          }
        } else {
          // Keep visualizer clean when not speaking
          updateAudioVisualizer(0);
        }
      }
    };

    showToast(`Audio capture started (${sourceVal === 'mic' ? 'Mic' : 'System'})`, 'success');
  } catch (err) {
    console.error('Audio capture start failed:', err);
    showToast('Failed to start audio capture: ' + err.message, 'error');
    setListening(false);
  }
}

function stopFrontendAudio() {
  const sourceVal = document.getElementById('setting-audio-source').value;
  if (sourceVal === 'mock') {
    socket.emit('command', { type: 'stop-listening' });
    return;
  }

  // Flush any remaining active speech in the buffer
  if (isSpeaking) {
    sendSpeechBuffer();
  }

  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor.onaudioprocess = null;
    scriptProcessor = null;
  }
  if (audioSourceNode) {
    audioSourceNode.disconnect();
    audioSourceNode = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  showToast('Audio capture stopped', 'info');
}

// ============ SETTINGS MANAGEMENT ============
function toggleSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  panel.classList.toggle('open');
}

function loadSettings() {
  const apiKey = localStorage.getItem('gemini_api_key') || '';
  const resume = localStorage.getItem('candidate_resume') || '';
  const audioSource = localStorage.getItem('audio_source') || 'mic';
  const opacity = localStorage.getItem('overlay_opacity') || '0.92';
  const fontSize = localStorage.getItem('overlay_font_size') || '13';
  const alwaysOnTop = localStorage.getItem('always_on_top') !== 'false';
  const autoHide = localStorage.getItem('auto_hide') === 'true';
  const vad = localStorage.getItem('vad_sensitivity') || '0.015';

  document.getElementById('setting-gemini-key').value = apiKey;
  document.getElementById('setting-resume').value = resume;
  document.getElementById('setting-audio-source').value = audioSource;
  document.getElementById('setting-opacity').value = opacity;
  document.getElementById('setting-font-size').value = fontSize;
  document.getElementById('setting-always-on-top').checked = alwaysOnTop;
  document.getElementById('setting-auto-hide').checked = autoHide;
  document.getElementById('setting-vad-sensitivity').value = vad;

  updateOpacity(opacity);
  updateFontSize(fontSize);
  toggleAlwaysOnTop(alwaysOnTop);
  toggleAutoHide(autoHide);
  updateVadLabel(vad);
  toggleVadSliderVisibility(audioSource);
}

function saveSettings() {
  const apiKey = document.getElementById('setting-gemini-key').value.trim();
  const resume = document.getElementById('setting-resume').value.trim();
  const audioSource = document.getElementById('setting-audio-source').value;
  const opacity = document.getElementById('setting-opacity').value;
  const fontSize = document.getElementById('setting-font-size').value;
  const alwaysOnTop = document.getElementById('setting-always-on-top').checked;
  const autoHide = document.getElementById('setting-auto-hide').checked;
  const vad = document.getElementById('setting-vad-sensitivity').value;

  localStorage.setItem('gemini_api_key', apiKey);
  localStorage.setItem('candidate_resume', resume);
  localStorage.setItem('audio_source', audioSource);
  localStorage.setItem('overlay_opacity', opacity);
  localStorage.setItem('overlay_font_size', fontSize);
  localStorage.setItem('always_on_top', alwaysOnTop);
  localStorage.setItem('auto_hide', autoHide);
  localStorage.setItem('vad_sensitivity', vad);

  updateOpacity(opacity);
  updateFontSize(fontSize);
  toggleAlwaysOnTop(alwaysOnTop);
  toggleAutoHide(autoHide);
  updateVadLabel(vad);

  if (socket && socket.connected) {
    socket.emit('settings-sync', {
      apiKey,
      resume,
      autoHide
    });
  }

  showToast('Settings saved & synced!', 'success');
  toggleSettingsPanel();
}

function updateOpacity(val) {
  appContainer.style.backgroundColor = `rgba(10, 10, 18, ${val})`;
}

function updateFontSize(val) {
  transcriptText.style.fontSize = val + 'px';
  suggestionText.style.fontSize = val + 'px';
  document.querySelectorAll('.chat-msg').forEach(m => m.style.fontSize = val + 'px');
}

function toggleAlwaysOnTop(checked) {
  ipcRenderer.send('set-always-on-top', checked);
}

function toggleAutoHide(checked) {
  if (socket && socket.connected) {
    socket.emit('command', { type: 'set-auto-hide', payload: checked });
  }
}

function changeAudioSource(val) {
  localStorage.setItem('audio_source', val);
  toggleVadSliderVisibility(val);
  if (isListening) {
    stopFrontendAudio();
    startFrontendAudio();
  }
}

// ============ COPY TO CLIPBOARD ============
function copyText(button) {
  const msgBody = button.parentElement.querySelector('.msg-body');
  if (!msgBody) return;
  const text = msgBody.innerText || msgBody.textContent;
  navigator.clipboard.writeText(text).then(() => {
    button.textContent = '✅ Copied';
    button.style.background = 'var(--accent-green)';
    button.style.borderColor = 'transparent';
    button.style.color = 'white';
    setTimeout(() => {
      button.textContent = '📋 Copy';
      button.style.background = 'rgba(255, 255, 255, 0.08)';
      button.style.borderColor = 'rgba(255, 255, 255, 0.12)';
      button.style.color = 'var(--text-secondary)';
    }, 2000);
  }).catch(() => {
    showToast('Copy failed', 'error');
  });
}

// ============ INIT ============
loadSettings();
connect();

// Auto-reconnect if engine starts later
setInterval(() => {
  if (!isConnected && !socket?.connected) {
    console.log('🔄 Attempting reconnect...');
  }
}, 10000);

console.log('👻 Ghost AI Renderer loaded');
console.log('📡 Connecting to:', ENGINE_URL);
