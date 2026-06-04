import 'dotenv/config';
import { EngineServer } from './server';
import { AudioPipeline } from './audio/AudioPipeline';
import { STTService } from './stt/STTService';
import { ContextService } from './context/ContextService';
import { LLMService } from './llm/LLMService';
import { SystemMonitor } from './monitor/SystemMonitor';
import { EventBus } from './utils/EventBus';
import { Logger } from './utils/Logger';

const logger = new Logger('Main');

async function bootstrap() {
  logger.info('🚀 Ghost AI Core Engine starting...');

  // Initialize event bus (communication backbone)
  const eventBus = new EventBus();

  // Initialize all services
  const contextService = new ContextService();
  const llmService = new LLMService();
  const sttService = new STTService();
  const audioPipeline = new AudioPipeline();
  const systemMonitor = new SystemMonitor();

  // Initialize HTTP/WebSocket server
  const server = new EngineServer(eventBus);
  await server.start();

  // Wire up the pipeline
  // STT → Context → LLM → Broadcast
  eventBus.on('stt:transcript', async (text: string) => {
    logger.debug(`📝 Transcript: ${text}`);
    contextService.addTranscript(text);
    eventBus.emit('ui:transcript', text);
  });

  // LLM is triggered on debounce after new transcript
  let llmTimer: ReturnType<typeof setTimeout> | null = null;
  const LLM_DEBOUNCE = parseInt(process.env.LLM_DEBOUNCE_MS || '500');

  eventBus.on('stt:transcript', () => {
    if (llmTimer) clearTimeout(llmTimer);
    llmTimer = setTimeout(async () => {
      const context = contextService.getContext();
      const mode = contextService.getMode();
      if (!context.trim()) return;

      logger.info('🧠 Calling LLM...');
      try {
        const resume = contextService.getResume();
        const suggestion = await llmService.getSuggestion(context, mode, resume);
        
        if (suggestion) {
          logger.info(`💡 Suggestion: ${suggestion}`);
          eventBus.emit('ui:suggestion', suggestion);
        }
      } catch (err: any) {
        logger.error('Gemini Call Error:', err);
      }
    }, LLM_DEBOUNCE);
  });

  // Audio → STT (Backend Fallback Capture)
  audioPipeline.on('chunk', async (chunk: Buffer) => {
    const text = await sttService.transcribe(chunk);
    if (text && text.trim()) {
      eventBus.emit('stt:transcript', text);
    }
  });

  // Frontend Audio → STT (WebSocket Capture)
  eventBus.on('audio:chunk', async (chunk: Buffer) => {
    const text = await sttService.transcribe(chunk);
    if (text && text.trim()) {
      eventBus.emit('stt:transcript', text);
    }
  });

  // Settings synchronization from client
  eventBus.on('settings:sync', (settings: { apiKey?: string; resume?: string; autoHide?: boolean }) => {
    if (settings.apiKey) {
      process.env.GEMINI_API_KEY = settings.apiKey;
      sttService.updateApiKey(settings.apiKey);
      llmService.updateApiKey(settings.apiKey);
    }
    if (settings.resume !== undefined) {
      contextService.setResume(settings.resume);
    }
    if (settings.autoHide !== undefined) {
      systemMonitor.setAutoHide(settings.autoHide);
    }
  });

  eventBus.on('command:set-auto-hide', (enabled: boolean) => {
    systemMonitor.setAutoHide(enabled);
  });

  // System monitor → overlay control
  systemMonitor.on('screenshare:start', () => {
    logger.warn('🖥️ Screen share DETECTED — hiding overlay');
    server.broadcast('overlay:hide', null);
  });

  systemMonitor.on('screenshare:stop', () => {
    logger.info('✅ Screen share stopped — showing overlay');
    server.broadcast('overlay:show', null);
  });

  // Listen for commands from overlay UI
  eventBus.on('command:start-listening', () => {
    logger.info('🎤 Starting audio capture...');
    audioPipeline.start();
  });

  eventBus.on('command:stop-listening', () => {
    logger.info('🔇 Stopping audio capture...');
    audioPipeline.stop();
  });

  eventBus.on('command:set-mode', (mode: string) => {
    logger.info(`🔄 Mode changed to: ${mode}`);
    contextService.setMode(mode as any);
    eventBus.emit('mode-changed', mode);
  });

  eventBus.on('command:clear-context', () => {
    contextService.clear();
    server.broadcast('context:cleared', null);
  });

  // Image analysis for Coding mode
  eventBus.on('command:analyze-image', async (base64Data: string) => {
    logger.info('📸 Analyzing screen capture...');
    try {
      const mode = contextService.getMode();
      const suggestion = await llmService.analyzeImage(base64Data, mode);
      if (suggestion) {
        eventBus.emit('ui:suggestion', suggestion);
      }
    } catch (err) {
      logger.error('Image analysis failed', err);
    }
  });

  // Add backdoor to test specific questions
  eventBus.on('command:inject-transcript', (text: string) => {
    logger.info(`💉 INJECTING CUSTOM TRANSCRIPT: ${text}`);
    // Trigger the regular pipeline
    eventBus.emit('stt:transcript', text);
  });

  // Start system monitoring
  systemMonitor.start();

  logger.info('✅ Ghost AI Core Engine ready!');
  logger.info(`📡 WebSocket server on port ${process.env.ENGINE_PORT || 3001}`);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('⏹️ Shutting down...');
    audioPipeline.stop();
    systemMonitor.stop();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
