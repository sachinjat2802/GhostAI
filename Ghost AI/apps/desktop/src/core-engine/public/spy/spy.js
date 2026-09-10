// Ghost AI Mobile Spy Client Engine
(function() {
  'use strict';

  // State Store
  const state = {
    mode: 'interview',
    isListening: false,
    transcript: '',
    messages: [], // { id, role, text }
    streamingText: '',
    isNearBottom: true,
    currentFontSize: 14,
    isDisguiseTheme: false
  };

  // DOM Elements Cache
  const el = {
    app: document.getElementById('app'),
    appTitle: document.getElementById('app-title'),
    statusDot: document.getElementById('status-dot'),
    modeBadge: document.getElementById('mode-badge'),
    modeSelect: document.getElementById('mode-select'),
    transcriptPanel: document.getElementById('transcript-panel'),
    transcriptEl: document.getElementById('transcript-content'),
    suggestionPanel: document.getElementById('suggestion-panel'),
    suggestionEl: document.getElementById('suggestion-content'),
    suggestLabel: document.getElementById('suggestion-label'),
    scrollContainer: document.getElementById('scroll-container'),
    scrollBottomPill: document.getElementById('btn-scroll-bottom'),
    btnListen: document.getElementById('btn-listen'),
    btnSolve: document.getElementById('btn-solve'),
    chatBar: document.getElementById('chat-bar'),
    chatInput: document.getElementById('chat-input'),
    settingsPanel: document.getElementById('settings-panel'),
    vadLabel: document.getElementById('vad-sensitivity-label')
  };

  // WebSocket Connection
  let socket = null;
  try {
    socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: Infinity });
  } catch (err) {
    console.warn('Socket.IO client init fallback:', err);
  }

  // Active Streaming DOM element reference for low-latency non-thrashing DOM updates
  let streamingMsgEl = null;
  let streamingTextNode = null;

  // Render Engine (Batch updates via requestAnimationFrame)
  let renderScheduled = false;

  function scheduleRender(updateMessages = false) {
    if (updateMessages) {
      renderMessagesList();
    }
    if (renderScheduled) return;
    renderScheduled = true;

    requestAnimationFrame(() => {
      renderScheduled = false;
      
      // Update UI Mode Layout
      if (el.modeBadge) el.modeBadge.textContent = state.mode;
      if (el.modeSelect && el.modeSelect.value !== state.mode) el.modeSelect.value = state.mode;

      if (el.transcriptPanel) {
        el.transcriptPanel.style.display = (state.mode === 'coding' || state.mode === 'general') ? 'none' : 'flex';
      }
      if (el.btnSolve) {
        el.btnSolve.style.display = (state.mode === 'coding' || state.mode === 'interview') ? 'block' : 'none';
      }
      if (el.btnListen) {
        el.btnListen.style.display = (state.mode === 'general') ? 'none' : 'block';
        el.btnListen.textContent = state.isListening ? 'Stop' : 'Start';
        el.btnListen.style.background = state.isListening ? '#ef4444' : '#8b5cf6';
      }
      if (el.chatBar) {
        el.chatBar.style.display = (state.mode === 'general' || state.mode === 'coding') ? 'flex' : 'none';
      }
      if (el.suggestLabel) {
        el.suggestLabel.textContent = (state.mode === 'general' || state.mode === 'coding') ? '💬 CHAT HISTORY' : '🧠 AI ANSWER';
      }

      // Update Transcript text
      if (el.transcriptEl && state.mode !== 'general') {
        el.transcriptEl.textContent = state.transcript || 'Listening...';
      }

      // Auto scroll if user is near bottom
      if (state.isNearBottom) {
        scrollToBottom(false);
      }
    });
  }

  // Render Full Messages List (Called only when message array structure changes)
  function renderMessagesList() {
    if (!el.suggestionEl) return;
    
    // Clear container
    el.suggestionEl.innerHTML = '';
    streamingMsgEl = null;
    streamingTextNode = null;

    state.messages.forEach(msg => {
      const msgDiv = document.createElement('div');
      msgDiv.className = `chat-msg ${msg.role === 'ai' ? 'ai-msg' : 'user-msg'}`;
      msgDiv.style.fontSize = `${state.currentFontSize}px`;
      msgDiv.innerHTML = formatMarkdown(msg.text);
      el.suggestionEl.appendChild(msgDiv);
    });

    // Append active streaming element if currently streaming
    if (state.streamingText) {
      appendOrUpdateStreamingElement(state.streamingText);
    }
  }

  // Incremental Streaming Chunk Handler (High performance - No whole-DOM destruction)
  function handleStreamingChunk(chunkToken) {
    state.streamingText += chunkToken;
    appendOrUpdateStreamingElement(state.streamingText);
    if (state.isNearBottom) {
      scrollToBottom(false);
    }
  }

  function appendOrUpdateStreamingElement(fullText) {
    if (!el.suggestionEl) return;

    if (!streamingMsgEl) {
      streamingMsgEl = document.createElement('div');
      streamingMsgEl.className = 'chat-msg ai-msg';
      streamingMsgEl.style.fontSize = `${state.currentFontSize}px`;
      
      const contentSpan = document.createElement('span');
      contentSpan.innerHTML = formatMarkdown(fullText);
      
      const cursorSpan = document.createElement('span');
      cursorSpan.className = 'streaming-cursor';
      cursorSpan.textContent = ' ▌';

      streamingMsgEl.appendChild(contentSpan);
      streamingMsgEl.appendChild(cursorSpan);
      el.suggestionEl.appendChild(streamingMsgEl);
    } else {
      const contentSpan = streamingMsgEl.firstElementChild;
      if (contentSpan) {
        contentSpan.innerHTML = formatMarkdown(fullText);
      }
    }
  }

  function endStreaming(finalText) {
    const textToPush = finalText || state.streamingText;
    if (textToPush) {
      state.messages.push({ role: 'ai', text: textToPush });
    }
    state.streamingText = '';
    streamingMsgEl = null;
    streamingTextNode = null;
    renderMessagesList();
    if (state.isNearBottom) {
      scrollToBottom(true);
    }
  }

  // Markdown formatting helper
  function formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^[•\-] (.+)/gm, '<div style="padding-left:10px;">• $1</div>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  // Scroll Manager
  function scrollToBottom(smooth = false) {
    if (!el.scrollContainer) return;
    el.scrollContainer.scrollTo({
      top: el.scrollContainer.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }

  if (el.scrollContainer) {
    el.scrollContainer.addEventListener('scroll', () => {
      const threshold = 60;
      const distanceFromBottom = el.scrollContainer.scrollHeight - el.scrollContainer.scrollTop - el.scrollContainer.clientHeight;
      state.isNearBottom = distanceFromBottom <= threshold;

      if (el.scrollBottomPill) {
        el.scrollBottomPill.style.display = state.isNearBottom ? 'none' : 'block';
      }
    }, { passive: true });
  }

  // Event Stream Router
  function handleStreamEvent(type, payload) {
    if (type === 'init-state') {
      if (!payload) return;
      if (payload.mode) state.mode = payload.mode;
      if (payload.transcript) state.transcript = payload.transcript;
      if (Array.isArray(payload.history)) {
        state.messages = payload.history.map(item => ({
          role: item.role === 'assistant' || item.role === 'ai' ? 'ai' : 'user',
          text: item.text
        }));
      }
      scheduleRender(true);
    } else if (type === 'ui:transcript') {
      state.transcript = payload;
      scheduleRender(false);
    } else if (type === 'ui:suggestion-chunk') {
      handleStreamingChunk(payload);
    } else if (type === 'ui:suggestion-end') {
      endStreaming(payload);
    } else if (type === 'ui:suggestion') {
      if (state.streamingText) {
        endStreaming(payload);
      } else if (!state.messages.length || state.messages[state.messages.length - 1].text !== payload) {
        state.messages.push({ role: 'ai', text: payload });
        scheduleRender(true);
      }
    } else if (type === 'command') {
      if (!payload || !payload.type) return;
      if (payload.type === 'start-listening') {
        state.isListening = true;
        startMobileAudioCapture();
      } else if (payload.type === 'stop-listening') {
        state.isListening = false;
        stopMobileAudioCapture();
      } else if (payload.type === 'clear-context') {
        state.transcript = '';
        state.messages = [];
        state.streamingText = '';
        scheduleRender(true);
      } else if (payload.type === 'set-mode') {
        state.mode = payload.payload;
        scheduleRender(false);
      }
    } else if (type === 'context:cleared') {
      state.transcript = '';
      state.messages = [];
      state.streamingText = '';
      scheduleRender(true);
    } else if (type === 'mode-changed') {
      state.mode = payload;
      scheduleRender(false);
    }
  }

  // Socket & SSE Handlers
  if (socket) {
    socket.on('connect', () => {
      updateStatus(true);
    });
    socket.on('disconnect', () => {
      updateStatus(false);
    });
    socket.on('init-state', (data) => handleStreamEvent('init-state', data));
    socket.on('ui:transcript', (data) => handleStreamEvent('ui:transcript', data));
    socket.on('ui:suggestion-chunk', (data) => handleStreamEvent('ui:suggestion-chunk', data));
    socket.on('ui:suggestion-end', (data) => handleStreamEvent('ui:suggestion-end', data));
    socket.on('ui:suggestion', (data) => handleStreamEvent('ui:suggestion', data));
    socket.on('command', (data) => handleStreamEvent('command', data));
    socket.on('context:cleared', (data) => handleStreamEvent('context:cleared', data));
    socket.on('mode-changed', (data) => handleStreamEvent('mode-changed', data));
  }

  function updateStatus(isConnected) {
    if (!el.statusDot) return;
    if (isConnected) {
      el.statusDot.style.background = '#10b981';
      el.statusDot.style.boxShadow = '0 0 10px #10b981';
    } else {
      el.statusDot.style.background = '#f59e0b';
      el.statusDot.style.boxShadow = '0 0 10px #f59e0b';
    }
  }

  // SSE Fallback
  function initActivityStream() {
    if (!!window.EventSource) {
      const sse = new EventSource('/api/stream');
      sse.onopen = () => updateStatus(true);
      sse.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          handleStreamEvent(msg.type, msg.payload);
        } catch (err) {}
      };
      sse.onerror = () => updateStatus(false);
    }
  }
  initActivityStream();

  // Mobile Web Audio API Microphone Capture Engine (iOS Compatible User-Gesture Unlocking)
  let mobileAudioContext = null;
  let mobileMediaStream = null;
  let mobileScriptProcessor = null;

  // Unlock AudioContext on first tap
  function unlockAudioContext() {
    if (mobileAudioContext && mobileAudioContext.state === 'suspended') {
      mobileAudioContext.resume().catch(() => {});
    }
  }
  document.addEventListener('touchstart', unlockAudioContext, { once: true, passive: true });
  document.addEventListener('click', unlockAudioContext, { once: true, passive: true });

  window.startMobileAudioCapture = async function() {
    if (mobileMediaStream) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mobileMediaStream = stream;
      mobileAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      if (mobileAudioContext.state === 'suspended') {
        await mobileAudioContext.resume();
      }
      const source = mobileAudioContext.createMediaStreamSource(stream);
      mobileScriptProcessor = mobileAudioContext.createScriptProcessor(4096, 1, 1);

      source.connect(mobileScriptProcessor);
      mobileScriptProcessor.connect(mobileAudioContext.destination);

      let speechBuf = [];
      let silTimer = null;
      const vadSens = parseFloat(localStorage.getItem('vad_sensitivity') || '0.015');

      mobileScriptProcessor.onaudioprocess = (e) => {
        if (!state.isListening) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        let sum = 0;

        for (let i = 0; i < input.length; i++) {
          const s = input[i];
          sum += s * s;
          const clamped = s < -1 ? -1 : s > 1 ? 1 : s;
          pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
        }

        const rms = Math.sqrt(sum / input.length);
        if (rms > vadSens) {
          speechBuf.push(pcm);
          if (silTimer) { clearTimeout(silTimer); silTimer = null; }
          if (speechBuf.length >= 30) {
            flushSpeech();
          }
        } else if (speechBuf.length > 0) {
          speechBuf.push(pcm);
          if (!silTimer) {
            silTimer = setTimeout(() => {
              flushSpeech();
            }, 1000);
          }
        }

        function flushSpeech() {
          if (silTimer) { clearTimeout(silTimer); silTimer = null; }
          if (speechBuf.length === 0) return;
          let total = 0;
          for (let i = 0; i < speechBuf.length; i++) total += speechBuf[i].length;
          const combined = new Int16Array(total);
          let offset = 0;
          for (let i = 0; i < speechBuf.length; i++) {
            combined.set(speechBuf[i], offset);
            offset += speechBuf[i].length;
          }
          speechBuf = [];

          if (socket && socket.connected) {
            socket.emit('audio-chunk', combined.buffer);
          } else {
            fetch('/api/audio-chunk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: combined.buffer
            }).catch(() => {});
          }
        }
      };
    } catch (err) {
      console.warn('Mobile mic capture unavailable:', err);
    }
  };

  window.stopMobileAudioCapture = function() {
    if (mobileScriptProcessor) {
      mobileScriptProcessor.disconnect();
      mobileScriptProcessor.onaudioprocess = null;
      mobileScriptProcessor = null;
    }
    if (mobileAudioContext) {
      mobileAudioContext.close();
      mobileAudioContext = null;
    }
    if (mobileMediaStream) {
      mobileMediaStream.getTracks().forEach(t => t.stop());
      mobileMediaStream = null;
    }
  };

  // Commands Dispatcher
  window.sendCommand = function(type, payload) {
    if (navigator.vibrate) {
      try { navigator.vibrate(35); } catch(e) {}
    }
    console.log('📱 Dispatching command:', type, payload);
    if (socket && socket.connected) {
      socket.emit('command', { type, payload });
    }
    fetch('/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload })
    }).catch(err => console.error('Command HTTP error:', err));
  };

  window.toggleListening = function() {
    state.isListening = !state.isListening;
    if (state.isListening) {
      startMobileAudioCapture();
    } else {
      stopMobileAudioCapture();
    }
    sendCommand(state.isListening ? 'start-listening' : 'stop-listening');
    scheduleRender(false);
  };

  window.triggerSolve = function() {
    state.messages.push({ role: 'user', text: '📸 Capturing screen from PC...' });
    scheduleRender(true);
    scrollToBottom(true);
    sendCommand('capture-screen');
  };

  window.sendChat = function() {
    if (!el.chatInput) return;
    const val = el.chatInput.value.trim();
    if (!val) return;
    el.chatInput.value = '';
    state.messages.push({ role: 'user', text: val });
    scheduleRender(true);
    scrollToBottom(true);
    sendCommand('inject-transcript', val);
  };

  window.triggerAiAction = function(action) {
    sendCommand('ai-action', action);
  };

  window.exportSession = function(format) {
    window.open('/export/' + format, '_blank');
  };

  // Font Size Adjuster
  window.adjustFontSize = function(delta) {
    state.currentFontSize = Math.max(11, Math.min(26, state.currentFontSize + delta));
    renderMessagesList();
  };

  // Disguise Theme Toggle
  window.toggleDisguiseTheme = function() {
    state.isDisguiseTheme = !state.isDisguiseTheme;
    if (state.isDisguiseTheme) {
      document.body.classList.add('theme-disguise');
      if (el.appTitle) el.appTitle.textContent = 'Meeting Notes';
    } else {
      document.body.classList.remove('theme-disguise');
      if (el.appTitle) el.appTitle.textContent = 'Ghost AI Remote';
    }
  };

  // Settings Panel Management
  window.toggleSettings = function() {
    if (!el.settingsPanel) return;
    el.settingsPanel.classList.toggle('active');
  };

  window.updateVadLabel = function(val) {
    if (el.vadLabel) el.vadLabel.textContent = parseFloat(val).toFixed(3);
  };

  window.loadSettings = function() {
    const geminiModel = localStorage.getItem('gemini_model') || 'gemini-3.5-flash-lite';
    const apiKey = localStorage.getItem('gemini_api_key') || '';
    const resume = localStorage.getItem('candidate_resume') || '';
    const jobDesc = localStorage.getItem('job_description') || '';
    const vad = localStorage.getItem('vad_sensitivity') || '0.015';

    const modelEl = document.getElementById('setting-gemini-model');
    if (modelEl) modelEl.value = geminiModel;
    const keyEl = document.getElementById('setting-gemini-key');
    if (keyEl) keyEl.value = apiKey;
    const resEl = document.getElementById('setting-resume');
    if (resEl) resEl.value = resume;
    const jobEl = document.getElementById('setting-job-desc');
    if (jobEl) jobEl.value = jobDesc;
    const vadEl = document.getElementById('setting-vad-sensitivity');
    if (vadEl) vadEl.value = vad;

    updateVadLabel(vad);
  };

  window.saveSettings = function() {
    const modelEl = document.getElementById('setting-gemini-model');
    const geminiModel = modelEl ? modelEl.value : 'gemini-3.5-flash-lite';
    const apiKey = document.getElementById('setting-gemini-key').value.trim();
    const resume = document.getElementById('setting-resume').value.trim();
    const jobDescription = document.getElementById('setting-job-desc').value.trim();
    const vad = document.getElementById('setting-vad-sensitivity').value;

    localStorage.setItem('gemini_model', geminiModel);
    localStorage.setItem('gemini_api_key', apiKey);
    localStorage.setItem('candidate_resume', resume);
    localStorage.setItem('job_description', jobDescription);
    localStorage.setItem('vad_sensitivity', vad);
    updateVadLabel(vad);

    const settingsPayload = {
      provider: 'gemini',
      geminiModel,
      apiKey,
      resume,
      jobDescription,
      vadThreshold: parseFloat(vad)
    };

    if (socket && socket.connected) {
      socket.emit('settings-sync', settingsPayload);
    }

    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsPayload)
    }).catch(() => {});

    toggleSettings();
  };

  if (socket) {
    socket.on('settings-sync', (settings) => {
      if (settings.geminiModel !== undefined) localStorage.setItem('gemini_model', settings.geminiModel);
      if (settings.apiKey !== undefined) localStorage.setItem('gemini_api_key', settings.apiKey);
      if (settings.resume !== undefined) localStorage.setItem('candidate_resume', settings.resume);
      if (settings.jobDescription !== undefined) localStorage.setItem('job_description', settings.jobDescription);
      if (settings.vadThreshold !== undefined) localStorage.setItem('vad_sensitivity', settings.vadThreshold);
      loadSettings();
    });
  }

  // Screen Wake Lock API (Prevents screen dimming during live interview session)
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        await navigator.wakeLock.request('screen');
      }
    } catch (err) {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
  requestWakeLock();

  // Initial setup
  loadSettings();
  scheduleRender(true);
})();
