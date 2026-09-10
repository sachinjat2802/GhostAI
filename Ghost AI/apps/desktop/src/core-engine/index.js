"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const server_1 = require("./server");
const AudioPipeline_1 = require("./audio/AudioPipeline");
const STTService_1 = require("./stt/STTService");
const ContextService_1 = require("./context/ContextService");
const LLMService_1 = require("./llm/LLMService");
const SystemMonitor_1 = require("./monitor/SystemMonitor");
const EventBus_1 = require("./utils/EventBus");
const Logger_1 = require("./utils/Logger");
const logger = new Logger_1.Logger('Main');
async function bootstrap() {
    logger.info('🚀 Ghost AI Core Engine starting...');
    // Initialize event bus (communication backbone)
    const eventBus = new EventBus_1.EventBus();
    // Initialize all services
    const contextService = new ContextService_1.ContextService();
    const llmService = new LLMService_1.LLMService();
    const sttService = new STTService_1.STTService();
    const audioPipeline = new AudioPipeline_1.AudioPipeline();
    const systemMonitor = new SystemMonitor_1.SystemMonitor();
    // Initialize HTTP/WebSocket server
    const server = new server_1.EngineServer(eventBus, contextService);
    await server.start();
    // Wire up the pipeline
    // STT → Context → LLM → Broadcast
    eventBus.on('stt:transcript', async (data) => {
        const text = typeof data === 'string' ? data : (typeof data === 'object' && data?.text ? data.text : '');
        if (!text)
            return;
        logger.debug(`📝 Transcript: ${text}`);
        contextService.addTranscript(text);
        eventBus.emit('ui:transcript', text);
    });
    // LLM is triggered on debounce after new transcript
    let llmTimer = null;
    const LLM_DEBOUNCE = parseInt(process.env.LLM_DEBOUNCE_MS || '100');
    const triggerLLM = async (force = false) => {
        const context = contextService.getContext();
        const mode = contextService.getMode();
        if (!context.trim())
            return;
        logger.info('🧠 Calling LLM (Streaming)...');
        try {
            const resume = contextService.getResume();
            const jobDescription = contextService.getJobDescription();
            let fullSuggestion = '';
            const suggestion = await llmService.getSuggestion(context, mode, resume, jobDescription, (token) => {
                fullSuggestion += token;
                eventBus.emit('ui:suggestion-chunk', token);
            }, force);
            eventBus.emit('ui:suggestion-end', null);
            const finalAns = suggestion || fullSuggestion;
            if (finalAns) {
                logger.info(`💡 Suggestion ready: ${finalAns.substring(0, 60)}...`);
                contextService.addSuggestion(finalAns);
                eventBus.emit('ui:suggestion', finalAns);
            }
        }
        catch (err) {
            logger.error('LLM Call Error:', err);
        }
    };
    eventBus.on('stt:transcript', (data) => {
        const isForce = typeof data === 'object' && data?.force;
        if (isForce) {
            if (llmTimer)
                clearTimeout(llmTimer);
            triggerLLM(true);
            return;
        }
        if (llmTimer)
            clearTimeout(llmTimer);
        llmTimer = setTimeout(() => triggerLLM(false), LLM_DEBOUNCE);
    });
    // Audio → STT (Backend Fallback Capture)
    audioPipeline.on('chunk', async (chunk) => {
        const text = await sttService.transcribe(chunk);
        if (text && text.trim()) {
            eventBus.emit('stt:transcript', text);
        }
    });
    // Frontend Audio → STT (WebSocket Capture)
    eventBus.on('audio:chunk', async (chunk) => {
        const text = await sttService.transcribe(chunk);
        if (text && text.trim()) {
            eventBus.emit('stt:transcript', text);
        }
    });
    // Settings synchronization from client
    eventBus.on('settings:sync', (settings) => {
        const selectedModel = settings.geminiModel || settings.modelName;
        if (selectedModel) {
            process.env.GEMINI_MODEL = selectedModel;
            llmService.setModelName(selectedModel);
        }
        if (settings.apiKey) {
            process.env.GEMINI_API_KEY = settings.apiKey;
            sttService.updateApiKey(settings.apiKey);
            llmService.updateApiKey(settings.apiKey, selectedModel);
        }
        if (settings.resume !== undefined) {
            contextService.setResume(settings.resume);
        }
        if (settings.jobDescription !== undefined) {
            contextService.setJobDescription(settings.jobDescription);
        }
        if (settings.autoHide !== undefined) {
            systemMonitor.setAutoHide(settings.autoHide);
        }
    });
    eventBus.on('command:set-auto-hide', (enabled) => {
        systemMonitor.setAutoHide(enabled);
    });
    // Session Export Handlers
    eventBus.on('command:export-md', (res) => {
        const md = contextService.exportMarkdown();
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', 'attachment; filename="ghost-ai-session.md"');
        res.send(md);
    });
    eventBus.on('command:export-json', (res) => {
        const json = contextService.exportJSON();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="ghost-ai-session.json"');
        res.send(json);
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
        llmService.prewarm();
    });
    eventBus.on('command:stop-listening', () => {
        logger.info('🔇 Stopping audio capture...');
        audioPipeline.stop();
    });
    eventBus.on('command:set-mode', (mode) => {
        logger.info(`🔄 Mode changed to: ${mode}`);
        contextService.setMode(mode);
        eventBus.emit('mode-changed', mode);
    });
    eventBus.on('command:clear-context', () => {
        contextService.clear();
        server.broadcast('context:cleared', null);
    });
    // Image analysis for Coding mode
    eventBus.on('command:analyze-image', async (base64Data) => {
        logger.info('📸 Analyzing screen capture...');
        try {
            const mode = contextService.getMode();
            const suggestion = await llmService.analyzeImage(base64Data, mode);
            const outputMsg = suggestion || '⚠️ No response generated for screen capture.';
            eventBus.emit('ui:suggestion', outputMsg);
        }
        catch (err) {
            logger.error('Image analysis failed', err);
            eventBus.emit('ui:suggestion', `⚠️ Image Analysis Error: ${err.message || 'Processing failed'}`);
        }
    });
    // Add backdoor to test specific questions
    eventBus.on('command:inject-transcript', (text) => {
        logger.info(`💉 INJECTING CUSTOM TRANSCRIPT: ${text}`);
        contextService.addTranscript(text);
        eventBus.emit('ui:transcript', text);
        eventBus.emit('stt:transcript', { text, force: true });
    });
    // AI Answer Refinement Action Chips (One-Tap Phone Tuning)
    const ACTION_PROMPTS = {
        shorter: 'Make the answer extremely concise (1 short sentence max).',
        'deeper-code': 'Provide detailed code implementation with Time & Space complexity analysis.',
        'bullet-points': 'Format the answer strictly as 3 clean bullet points.',
        regenerate: 'Provide an alternative, highly persuasive approach to this answer.',
    };
    eventBus.on('command:ai-action', async (action) => {
        logger.info(`✨ AI Action triggered: ${action}`);
        const context = contextService.getContext();
        const mode = contextService.getMode();
        if (!context.trim())
            return;
        const modifierPrompt = ACTION_PROMPTS[action] || '';
        try {
            let fullSuggestion = '';
            const suggestion = await llmService.getSuggestion(context + (modifierPrompt ? '\n[Instruction: ' + modifierPrompt + ']' : ''), mode, contextService.getResume(), contextService.getJobDescription(), (token) => {
                fullSuggestion += token;
                eventBus.emit('ui:suggestion-chunk', token);
            }, true);
            eventBus.emit('ui:suggestion-end', null);
            const finalAns = suggestion || fullSuggestion;
            if (finalAns) {
                contextService.addSuggestion(finalAns);
                eventBus.emit('ui:suggestion', finalAns);
            }
        }
        catch (err) {
            logger.error('AI Action error:', err);
        }
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
//# sourceMappingURL=index.js.map