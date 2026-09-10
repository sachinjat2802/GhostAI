"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STTService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const openai_1 = __importDefault(require("openai"));
const generative_ai_1 = require("@google/generative-ai");
const Logger_1 = require("../utils/Logger");
const logger = new Logger_1.Logger('STTService');
class STTService {
    provider = 'gemini';
    openai = null;
    genAI = null;
    geminiModel = null;
    sampleRate = parseInt(process.env.AUDIO_SAMPLE_RATE || '16000');
    localWhisperUrl = process.env.LOCAL_WHISPER_URL || 'http://localhost:8000/transcribe';
    constructor() {
        const configuredProvider = process.env.STT_PROVIDER || 'gemini';
        const key = process.env.GEMINI_API_KEY || '';
        const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        if (configuredProvider === 'local-whisper') {
            this.provider = 'local-whisper';
            logger.info(`🎤 STT: Local Faster-Whisper Python server (${this.localWhisperUrl})`);
        }
        else if (key) {
            this.provider = 'gemini';
            this.genAI = new generative_ai_1.GoogleGenerativeAI(key);
            this.geminiModel = this.genAI.getGenerativeModel({ model: modelName });
            logger.info(`🎤 STT: Real Gemini Flash mode (${modelName}) initialized`);
        }
        else if (process.env.OPENAI_API_KEY) {
            this.provider = 'openai';
            this.openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
            logger.info('🎤 STT: Real OpenAI Whisper mode initialized');
        }
        else {
            logger.warn('⚠️ No API Key set for STT — please set GEMINI_API_KEY in .env or Settings');
        }
    }
    updateApiKey(key, provider = 'gemini') {
        this.provider = provider;
        if (this.provider === 'local-whisper') {
            logger.info(`🎤 STT: Local Faster-Whisper Python server activated (${this.localWhisperUrl})`);
            return;
        }
        if (!key)
            return;
        if (this.provider === 'gemini') {
            const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
            this.genAI = new generative_ai_1.GoogleGenerativeAI(key);
            this.geminiModel = this.genAI.getGenerativeModel({ model: modelName });
            logger.info(`🎤 STT: Gemini Flash mode activated (${modelName})`);
        }
        else if (this.provider === 'openai') {
            this.openai = new openai_1.default({ apiKey: key });
            logger.info('🎤 STT: OpenAI Whisper mode activated');
        }
    }
    async transcribe(audioChunk) {
        try {
            if (this.provider === 'local-whisper') {
                return await this.transcribeWithLocalWhisper(audioChunk);
            }
            else if (this.provider === 'gemini' && this.genAI) {
                return await this.transcribeWithGemini(audioChunk);
            }
            else if (this.provider === 'openai' && this.openai) {
                return await this.transcribeWithOpenAI(audioChunk);
            }
            return null;
        }
        catch (err) {
            logger.error(`STT Error [${this.provider}]: ${err.message}`);
            return null;
        }
    }
    async transcribeWithLocalWhisper(audioChunk) {
        if (audioChunk.length < 1000)
            return null;
        try {
            const wavBuffer = this.pcmToWav(audioChunk);
            const blob = new Blob([wavBuffer], { type: 'audio/wav' });
            const formData = new FormData();
            formData.append('file', blob, 'audio.wav');
            const response = await fetch(this.localWhisperUrl, {
                method: 'POST',
                body: formData,
            });
            if (!response.ok)
                return null;
            const data = await response.json();
            return data.text ? data.text.trim() : null;
        }
        catch (err) {
            logger.error(`Local Faster-Whisper Error: ${err.message}`);
            return null;
        }
    }
    async transcribeWithOpenAI(audioChunk) {
        if (audioChunk.length < 1000)
            return null;
        const tmpFile = path.join(os.tmpdir(), `ghost-audio-${Date.now()}.wav`);
        try {
            const wavBuffer = this.pcmToWav(audioChunk);
            fs.writeFileSync(tmpFile, wavBuffer);
            const transcription = await this.openai.audio.transcriptions.create({
                file: fs.createReadStream(tmpFile),
                model: 'whisper-1',
                language: 'en',
                response_format: 'text',
            });
            return typeof transcription === 'string' ? transcription.trim() : null;
        }
        finally {
            try {
                fs.unlinkSync(tmpFile);
            }
            catch { }
        }
    }
    async transcribeWithGemini(audioChunk) {
        if (audioChunk.length < 1600)
            return null; // minimum 0.05s of audio
        try {
            const wavBuffer = this.pcmToWav(audioChunk);
            const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
            if (!this.geminiModel && this.genAI) {
                this.geminiModel = this.genAI.getGenerativeModel({ model: modelName });
            }
            const model = this.geminiModel;
            const result = await model.generateContent({
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                inlineData: {
                                    mimeType: 'audio/wav',
                                    data: wavBuffer.toString('base64'),
                                },
                            },
                            { text: 'Transcribe the audio accurately. If there is no speech, return an empty string. Only return the transcription, no extra text.' },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.0,
                    maxOutputTokens: 60,
                },
            });
            const text = result.response.text().trim();
            return text || null;
        }
        catch (err) {
            logger.error(`Gemini STT Error: ${err.message}`);
            return null;
        }
    }
    pcmToWav(pcmBuffer) {
        const sampleRate = this.sampleRate;
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
        const blockAlign = (numChannels * bitsPerSample) / 8;
        const dataSize = pcmBuffer.length;
        const headerSize = 44;
        const wavBuffer = Buffer.allocUnsafe(headerSize + dataSize);
        wavBuffer.write('RIFF', 0);
        wavBuffer.writeUInt32LE(36 + dataSize, 4);
        wavBuffer.write('WAVE', 8);
        wavBuffer.write('fmt ', 12);
        wavBuffer.writeUInt32LE(16, 16);
        wavBuffer.writeUInt16LE(1, 20);
        wavBuffer.writeUInt16LE(numChannels, 22);
        wavBuffer.writeUInt32LE(sampleRate, 24);
        wavBuffer.writeUInt32LE(byteRate, 28);
        wavBuffer.writeUInt16LE(blockAlign, 32);
        wavBuffer.writeUInt16LE(bitsPerSample, 34);
        wavBuffer.write('data', 36);
        wavBuffer.writeUInt32LE(dataSize, 40);
        pcmBuffer.copy(wavBuffer, headerSize);
        return wavBuffer;
    }
}
exports.STTService = STTService;
//# sourceMappingURL=STTService.js.map