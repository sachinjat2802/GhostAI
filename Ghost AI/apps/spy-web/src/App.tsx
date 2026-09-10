import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Header } from './components/Header';
import { TranscriptPanel } from './components/TranscriptPanel';
import { SuggestionPanel, type ChatMessage } from './components/SuggestionPanel';
import { ActionChips } from './components/ActionChips';
import { ChatBar } from './components/ChatBar';
import { ControlBar } from './components/ControlBar';
import { SettingsModal } from './components/SettingsModal';

export function App() {
  const [mode, setMode] = useState('interview');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [isDisguiseTheme, setIsDisguiseTheme] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const socketRef = useRef<Socket | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  // Scroll Manager
  const scrollToBottom = useCallback((smooth = false) => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsNearBottom(distanceFromBottom <= 60);
  }, []);

  // Send Remote Commands
  const sendCommand = useCallback((type: string, payload?: any) => {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(35);
      } catch (e) {}
    }
    console.log('📱 Dispatching command:', type, payload);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('command', { type, payload });
    }
    fetch('/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload }),
    }).catch(() => {});
  }, []);

  // Audio Capture Control
  const stopAudioCapture = useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const startAudioCapture = useCallback(async () => {
    if (mediaStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);

      // Try AudioWorklet first for 0-lag background audio processing
      if (audioCtx.audioWorklet) {
        try {
          await audioCtx.audioWorklet.addModule('/audio-processor.js');
          const workletNode = new AudioWorkletNode(audioCtx, 'ghost-audio-processor');
          (scriptProcessorRef as any).current = workletNode;

          workletNode.port.onmessage = (event) => {
            if (event.data.type === 'AUDIO_CHUNK' && event.data.buffer) {
              if (socketRef.current && socketRef.current.connected) {
                socketRef.current.emit('audio-chunk', event.data.buffer);
              } else {
                fetch('/api/audio-chunk', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/octet-stream' },
                  body: event.data.buffer,
                }).catch(() => {});
              }
            }
          };

          source.connect(workletNode);
          workletNode.connect(audioCtx.destination);
          return;
        } catch (workletErr) {
          console.log('Fallback to ScriptProcessor:', workletErr);
        }
      }

      // Legacy Fallback Processor
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      source.connect(processor);
      processor.connect(audioCtx.destination);

      let speechBuf: Int16Array[] = [];
      let silTimer: any = null;
      const vadSens = parseFloat(localStorage.getItem('vad_sensitivity') || '0.015');

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        let sum = 0;

        for (let i = 0; i < input.length; i++) {
          const s = input[i];
          sum += s * s;
          const clamped = s < -1 ? -1 : s > 1 ? 1 : s;
          pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        }

        const rms = Math.sqrt(sum / input.length);
        if (rms > vadSens) {
          speechBuf.push(pcm);
          if (silTimer) {
            clearTimeout(silTimer);
            silTimer = null;
          }
          if (speechBuf.length >= 3) {
            flushSpeech();
          }
        } else if (speechBuf.length > 0) {
          speechBuf.push(pcm);
          if (!silTimer) {
            silTimer = setTimeout(() => {
              flushSpeech();
            }, 350);
          }
        }

        function flushSpeech() {
          if (silTimer) {
            clearTimeout(silTimer);
            silTimer = null;
          }
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

          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('audio-chunk', combined.buffer);
          } else {
            fetch('/api/audio-chunk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: combined.buffer,
            }).catch(() => {});
          }
        }
      };
    } catch (err) {
      console.warn('Mobile mic capture error:', err);
    }
  }, []);

  const toggleListening = useCallback(() => {
    setIsListening((prev) => {
      const next = !prev;
      if (next) {
        startAudioCapture();
      } else {
        stopAudioCapture();
      }
      sendCommand(next ? 'start-listening' : 'stop-listening');
      return next;
    });
  }, [startAudioCapture, stopAudioCapture, sendCommand]);

  // Handle Event Streams
  const handleStreamEvent = useCallback(
    (type: string, payload: any) => {
      if (type === 'init-state') {
        if (!payload) return;
        if (payload.mode) setMode(payload.mode);
        if (payload.transcript) setTranscript(payload.transcript);
        if (Array.isArray(payload.history)) {
          setMessages(
            payload.history.map((item: any, idx: number) => ({
              id: `init-${idx}`,
              role: item.role === 'assistant' || item.role === 'ai' ? 'ai' : 'user',
              text: item.text,
            }))
          );
        }
      } else if (type === 'ui:transcript') {
        setTranscript(payload);
      } else if (type === 'ui:suggestion-chunk') {
        setStreamingText((prev) => prev + payload);
      } else if (type === 'ui:suggestion-end') {
        setStreamingText((currStream) => {
          const textToPush = payload || currStream;
          if (textToPush) {
            setMessages((prev) => [
              ...prev,
              { id: Date.now().toString(), role: 'ai', text: textToPush },
            ]);
          }
          return '';
        });
      } else if (type === 'ui:suggestion') {
        setStreamingText('');
        setMessages((prev) => {
          if (!prev.length || prev[prev.length - 1].text !== payload) {
            return [
              ...prev,
              { id: Date.now().toString(), role: 'ai', text: payload },
            ];
          }
          return prev;
        });
      } else if (type === 'command') {
        if (!payload || !payload.type) return;
        if (payload.type === 'start-listening') {
          setIsListening(true);
          startAudioCapture();
        } else if (payload.type === 'stop-listening') {
          setIsListening(false);
          stopAudioCapture();
        } else if (payload.type === 'clear-context') {
          setTranscript('');
          setMessages([]);
          setStreamingText('');
        } else if (payload.type === 'set-mode') {
          setMode(payload.payload);
        }
      } else if (type === 'context:cleared') {
        setTranscript('');
        setMessages([]);
        setStreamingText('');
      } else if (type === 'mode-changed') {
        setMode(payload);
      }
    },
    [startAudioCapture, stopAudioCapture]
  );

  // Initialize Socket.IO & SSE
  useEffect(() => {
    const socket = io({
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });
    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('init-state', (data) => handleStreamEvent('init-state', data));
    socket.on('ui:transcript', (data) => handleStreamEvent('ui:transcript', data));
    socket.on('ui:suggestion-chunk', (data) => handleStreamEvent('ui:suggestion-chunk', data));
    socket.on('ui:suggestion-end', (data) => handleStreamEvent('ui:suggestion-end', data));
    socket.on('ui:suggestion', (data) => handleStreamEvent('ui:suggestion', data));
    socket.on('command', (data) => handleStreamEvent('command', data));
    socket.on('context:cleared', (data) => handleStreamEvent('context:cleared', data));
    socket.on('mode-changed', (data) => handleStreamEvent('mode-changed', data));

    // SSE Fallback (only initialized if Socket.IO fails to connect after 2s)
    let sse: EventSource | null = null;
    const sseTimer = setTimeout(() => {
      if (!socket.connected && !!window.EventSource) {
        console.log('📡 Socket disconnected — falling back to SSE stream...');
        sse = new EventSource('/api/stream');
        sse.onopen = () => setIsConnected(true);
        sse.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            handleStreamEvent(msg.type, msg.payload);
          } catch (err) {}
        };
        sse.onerror = () => setIsConnected(false);
      }
    }, 2000);

    return () => {
      clearTimeout(sseTimer);
      socket.disconnect();
      if (sse) sse.close();
      stopAudioCapture();
    };
  }, [handleStreamEvent, stopAudioCapture]);

  // Auto scroll when near bottom
  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom(false);
    }
  }, [messages, streamingText, transcript, isNearBottom, scrollToBottom]);

  // Keep Screen Awake
  useEffect(() => {
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          await navigator.wakeLock.request('screen');
        }
      } catch (err) {}
    }
    requestWakeLock();
  }, []);

  const handleTriggerSolve = () => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'user',
        text: '📸 Capturing screen from PC...',
      },
    ]);
    scrollToBottom(true);
    sendCommand('capture-screen');
  };

  const handleSendChat = (val: string) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: 'user', text: val },
    ]);
    scrollToBottom(true);
    sendCommand('inject-transcript', val);
  };

  const handleSaveSettings = (settings: any) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('settings-sync', settings);
    }
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch(() => {});
  };

  const handleExportSession = (format: 'md' | 'json') => {
    window.open('/export/' + format, '_blank');
  };

  const showTranscript = mode !== 'coding' && mode !== 'general';
  const showChatBar = mode === 'general' || mode === 'coding';

  return (
    <div className={`app-container ${isDisguiseTheme ? 'theme-disguise' : ''}`}>
      <Header
        mode={mode}
        isDisguiseTheme={isDisguiseTheme}
        onToggleDisguise={() => setIsDisguiseTheme((prev) => !prev)}
        onAdjustFontSize={(delta) =>
          setFontSize((prev) => Math.max(11, Math.min(26, prev + delta)))
        }
        onToggleSettings={() => setIsSettingsOpen(true)}
        isConnected={isConnected}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaveSettings={handleSaveSettings}
        onExportSession={handleExportSession}
      />

      <main
        className="main-scrollable"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {showTranscript && (
          <TranscriptPanel transcript={transcript} isListening={isListening} />
        )}

        <SuggestionPanel
          messages={messages}
          streamingText={streamingText}
          fontSize={fontSize}
          mode={mode}
        />
      </main>

      {!isNearBottom && (
        <button
          className="scroll-bottom-pill"
          onClick={() => scrollToBottom(true)}
        >
          ⬇️ New Messages
        </button>
      )}

      <footer className="bottom-bar">
        <ActionChips
          onTriggerAiAction={(action) => sendCommand('ai-action', action)}
        />

        {showChatBar && <ChatBar onSendChat={handleSendChat} />}

        <ControlBar
          mode={mode}
          isListening={isListening}
          onToggleListening={toggleListening}
          onTriggerSolve={handleTriggerSolve}
          onSendCommand={sendCommand}
        />
      </footer>
    </div>
  );
}
