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
    loadServerInfo();
    
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

  let currentStreamingMsg = null;

  socket.on('ui:transcript', (text) => {
    updateTranscript(text);
    showThinking();
  });

  socket.on('ui:suggestion-chunk', (token) => {
    hideThinking();
    suggestionEmpty.style.display = 'none';
    suggestionText.style.display = 'flex';

    if (!currentStreamingMsg) {
      currentStreamingMsg = document.createElement('div');
      currentStreamingMsg.className = 'chat-msg ai-msg animate';
      currentStreamingMsg.innerHTML = `<div class="msg-body"></div><button class="copy-btn" onclick="copyText(this)" title="Copy to clipboard">📋 Copy</button>`;
      suggestionText.appendChild(currentStreamingMsg);
    }

    const bodyEl = currentStreamingMsg.querySelector('.msg-body');
    if (bodyEl) {
      bodyEl.innerHTML += formatSuggestion(token);
    }
    suggestionText.parentElement.scrollTop = suggestionText.parentElement.scrollHeight;
  });

  socket.on('ui:suggestion-end', () => {
    currentStreamingMsg = null;
    hideThinking();
  });

  socket.on('ui:suggestion', (text) => {
    hideThinking();
    if (currentStreamingMsg) {
      const bodyEl = currentStreamingMsg.querySelector('.msg-body');
      if (bodyEl) bodyEl.innerHTML = formatSuggestion(text);
      currentStreamingMsg = null;
    } else {
      appendChatMessage(text, 'ai');
    }
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
    if (settings.geminiModel !== undefined) localStorage.setItem('gemini_model', settings.geminiModel);
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
    console.log('🕹️ Remote command received:', cmd);
    if (!cmd || !cmd.type) return;
    switch(cmd.type) {
      case 'start-listening':
        setListening(true);
        break;
      case 'stop-listening':
        setListening(false);
        break;
      case 'clear-context':
        clearContext();
        break;
      case 'capture-screen':
        captureScreen();
        break;
      case 'toggle-visibility':
        try { ipcRenderer.send('toggle-visibility'); } catch(e) {}
        break;
      case 'set-mode':
        if (cmd.payload) changeMode(cmd.payload);
        break;
      case 'toggle-stealth':
        toggleStealth();
        break;
      case 'toggle-text-only':
        toggleTextOnly();
        break;
      case 'toggle-click-through':
        toggleClickThrough();
        break;
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

  // Cap DOM children at max 25 elements for ultra-fast rendering & zero DOM memory bloat
  while (suggestionText.children.length >= 25) {
    suggestionText.removeChild(suggestionText.firstChild);
  }

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
  } else if (mode === 'interview') {
    aiPanelLabel.textContent = 'AI ANSWER';
    chatInputContainer.style.display = 'none';
    transcriptPanel.style.display = 'block';
    btnCapture.style.display = 'flex';
    btnListen.style.display = 'flex';
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

let captureTimeout = null;

async function captureScreen() {
  showToast('Capturing screen...', 'info');
  showThinking();
  try {
    ipcRenderer.send('capture-screen');
    if (captureTimeout) clearTimeout(captureTimeout);
    captureTimeout = setTimeout(() => {
      hideThinking();
      showToast('Screenshot capture timed out', 'error');
    }, 12000);
  } catch (err) {
    hideThinking();
    showToast('Capture failed: ' + err.message, 'error');
  }
}

// Receive captured image (base64) from main process
ipcRenderer.on('screen-captured', (_, base64Image) => {
  if (captureTimeout) { clearTimeout(captureTimeout); captureTimeout = null; }
  if (socket && socket.connected) {
    console.log('📸 Sending screen capture to engine for analysis...');
    socket.emit('command', { type: 'analyze-image', payload: base64Image });
  } else {
    hideThinking();
    showToast('Core engine disconnected', 'error');
  }
});

ipcRenderer.on('screen-capture-failed', (_, reason) => {
  if (captureTimeout) { clearTimeout(captureTimeout); captureTimeout = null; }
  hideThinking();
  showToast('Screenshot failed: ' + reason, 'error');
  appendChatMessage('⚠️ Screenshot capture failed: ' + reason, 'ai');
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
let isHeaderDragging = false;
let dragStartX = 0;
let dragStartY = 0;

const dragHeaderEl = document.getElementById('drag-region');
if (dragHeaderEl) {
  dragHeaderEl.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) return;
    isHeaderDragging = true;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isHeaderDragging) return;
    const deltaX = e.screenX - dragStartX;
    const deltaY = e.screenY - dragStartY;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    ipcRenderer.send('window-drag-move', { deltaX, deltaY });
  });

  window.addEventListener('mouseup', () => {
    isHeaderDragging = false;
  });
}

document.getElementById('btn-minimize').addEventListener('click', () => {
  try { ipcRenderer.send('toggle-visibility'); } catch(e) {}
});

// ============ VAD & AUDIO VISUALIZER STATE ============
let speechBuffer = [];
let isSpeaking = false;
let silenceTimer = null;
let speechDuration = 0;
const SILENCE_GAP_MS = 350;
const MAX_SPEECH_DURATION_MS = 3000;
let vadThreshold = 0.015;

function updateVadLabel(val) {
  const rounded = parseFloat(val).toFixed(3);
  document.getElementById('vad-sensitivity-label').textContent = rounded;
  vadThreshold = parseFloat(val);
}

function toggleVadSliderVisibility(source) {
  const vadGroup = document.getElementById('setting-group-vad');
  if (vadGroup) {
    vadGroup.style.display = 'flex';
  }
}

let cachedAudioBars = null;
let currentVisualizerRms = 0;
let isVisualizerLoopRunning = false;

function animateVisualizer() {
  if (!isListening) {
    isVisualizerLoopRunning = false;
    if (cachedAudioBars) {
      cachedAudioBars.forEach(bar => { bar.style.transform = 'scaleY(0.3)'; bar.style.opacity = '0.4'; });
    }
    return;
  }

  if (!cachedAudioBars || cachedAudioBars.length === 0) {
    cachedAudioBars = Array.from(document.querySelectorAll('#audio-bars .bar'));
  }

  if (cachedAudioBars.length > 0) {
    const scaleTarget = 0.3 + (currentVisualizerRms * 100);
    const now = Date.now() / 150;

    for (let index = 0; index < cachedAudioBars.length; index++) {
      const bar = cachedAudioBars[index];
      const phase = Math.sin(now + index) * 0.2;
      const scale = Math.max(0.3, Math.min(1.5, scaleTarget + phase));
      bar.style.transform = `scaleY(${scale})`;
      bar.style.opacity = '1';
    }
  }

  requestAnimationFrame(animateVisualizer);
}

function updateAudioVisualizer(rms) {
  currentVisualizerRms = rms;
  if (!isVisualizerLoopRunning && isListening) {
    isVisualizerLoopRunning = true;
    requestAnimationFrame(animateVisualizer);
  }
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

function downsampleTo16k(inputData, inputSampleRate) {
  if (inputSampleRate === 16000) {
    const pcm = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = inputData[i] < -1 ? -1 : inputData[i] > 1 ? 1 : inputData[i];
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm;
  }

  const ratio = inputSampleRate / 16000;
  const newLength = Math.floor(inputData.length / ratio);
  const result = new Int16Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originPos = i * ratio;
    const i0 = Math.floor(originPos);
    const i1 = Math.min(i0 + 1, inputData.length - 1);
    const frac = originPos - i0;
    const interpolated = inputData[i0] * (1 - frac) + inputData[i1] * frac;
    const clamped = interpolated < -1 ? -1 : interpolated > 1 ? 1 : interpolated;
    result[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
  }

  return result;
}

// ============ AUDIO PIPELINE ============
async function startFrontendAudio() {
  const sourceVal = document.getElementById('setting-audio-source').value;

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
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    try {
      audioContext = new AudioCtx({ sampleRate: 16000 });
    } catch (e) {
      console.warn('16kHz native AudioContext unsupported, using default hardware sample rate:', e);
      audioContext = new AudioCtx();
    }

    audioSourceNode = audioContext.createMediaStreamSource(stream);
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    
    audioSourceNode.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    const nativeRate = audioContext.sampleRate;

    scriptProcessor.onaudioprocess = (e) => {
      if (!isListening) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const len = inputData.length;
      let sum = 0;

      for (let i = 0; i < len; i++) {
        const sample = inputData[i];
        sum += sample * sample;
      }
      
      const rms = Math.sqrt(sum / len);
      
      // Drive the visualizer
      updateAudioVisualizer(rms);

      // Downsample input audio Float32Array to 16,000Hz mono Int16Array PCM
      const pcmChunk = downsampleTo16k(inputData, nativeRate);
      
      // VAD logic
      if (rms > vadThreshold) {
        isSpeaking = true;
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
        speechBuffer.push(pcmChunk);
        speechDuration += (pcmChunk.length / 16000) * 1000;
        
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

// ============ KEYBOARD COMMANDS FROM MAIN PROCESS ============
let isClickThrough = false;

function toggleClickThrough() {
  isClickThrough = !isClickThrough;
  ipcRenderer.send('set-click-through', isClickThrough);
  const btn = document.getElementById('btn-click-through');
  if (btn) {
    if (isClickThrough) {
      btn.classList.add('active');
      btn.style.background = 'rgba(139, 92, 246, 0.3)';
    } else {
      btn.classList.remove('active');
      btn.style.background = 'none';
    }
  }
  showToast(`Click-Through Mode ${isClickThrough ? 'ENABLED (Clicks pass through)' : 'DISABLED'}`, 'info');
}

function exportSession(format) {
  window.open(`${ENGINE_URL}/export/${format}`, '_blank');
}

let latestSpyUrl = 'http://localhost:3001/spy';

async function loadServerInfo() {
  try {
    const res = await fetch(`${ENGINE_URL}/api/info`);
    if (res.ok) {
      const data = await res.json();
      if (data.spyUrl) {
        latestSpyUrl = data.spyUrl;
        const qrEl = document.getElementById('spy-qr-code');
        const urlEl = document.getElementById('spy-url-text');
        if (qrEl) qrEl.src = data.qrUrl;
        if (urlEl) urlEl.textContent = data.spyUrl;
      }
    }
  } catch (err) {
    console.warn('Failed to load server info:', err);
  }
}

function copySpyUrl() {
  try {
    const { clipboard } = require('electron');
    clipboard.writeText(latestSpyUrl);
    showToast('Copied Mobile Spy URL: ' + latestSpyUrl, 'success');
  } catch (e) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(latestSpyUrl).then(() => {
        showToast('Copied Mobile Spy URL: ' + latestSpyUrl, 'success');
      }).catch(() => {
        showToast('Copy failed', 'error');
      });
    }
  }
}

function openSpyUrl() {
  try {
    ipcRenderer.send('open-external', latestSpyUrl);
  } catch (e) {
    window.open(latestSpyUrl, '_blank');
  }
}

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
    case 'toggle-click-through':
      toggleClickThrough();
      break;
    case 'capture-screen-trigger':
      captureScreen();
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

// ============ SETTINGS MANAGEMENT ============
function toggleSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  panel.classList.toggle('open');
}

function loadSettings() {
  const geminiModel = localStorage.getItem('gemini_model') || 'gemini-3.5-flash-lite';
  const apiKey = localStorage.getItem('gemini_api_key') || '';
  const resume = localStorage.getItem('candidate_resume') || '';
  const jobDesc = localStorage.getItem('job_description') || '';
  const audioSource = localStorage.getItem('audio_source') || 'mic';
  const opacity = localStorage.getItem('overlay_opacity') || '0.50';
  const fontSize = localStorage.getItem('overlay_font_size') || '13';
  const alwaysOnTop = localStorage.getItem('always_on_top') !== 'false';
  const autoHide = localStorage.getItem('auto_hide') === 'true';
  const vad = localStorage.getItem('vad_sensitivity') || '0.015';

  const modelEl = document.getElementById('setting-gemini-model');
  if (modelEl) modelEl.value = geminiModel;
  document.getElementById('setting-gemini-key').value = apiKey;
  document.getElementById('setting-resume').value = resume;
  const jobDescEl = document.getElementById('setting-job-desc');
  if (jobDescEl) jobDescEl.value = jobDesc;
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
  loadServerInfo();
}

function saveSettings() {
  const modelEl = document.getElementById('setting-gemini-model');
  const geminiModel = modelEl ? modelEl.value : 'gemini-3.5-flash-lite';
  const apiKey = document.getElementById('setting-gemini-key').value.trim();
  const resume = document.getElementById('setting-resume').value.trim();
  const jobDescEl = document.getElementById('setting-job-desc');
  const jobDescription = jobDescEl ? jobDescEl.value.trim() : '';
  const audioSource = document.getElementById('setting-audio-source').value;
  const opacity = document.getElementById('setting-opacity').value;
  const fontSize = document.getElementById('setting-font-size').value;
  const alwaysOnTop = document.getElementById('setting-always-on-top').checked;
  const autoHide = document.getElementById('setting-auto-hide').checked;
  const vad = document.getElementById('setting-vad-sensitivity').value;

  localStorage.setItem('gemini_model', geminiModel);
  localStorage.setItem('gemini_api_key', apiKey);
  localStorage.setItem('candidate_resume', resume);
  localStorage.setItem('job_description', jobDescription);
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
      provider: 'gemini',
      geminiModel,
      apiKey,
      resume,
      jobDescription,
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

console.log('👻 Ghost AI Renderer loaded');
console.log('📡 Connecting to:', ENGINE_URL);
