import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from '../utils/Logger';

const logger = new Logger('STTService');

export type STTProvider = 'gemini' | 'openai' | 'local-whisper';

export class STTService {
  private provider: STTProvider = 'gemini';
  private openai: OpenAI | null = null;
  private genAI: GoogleGenerativeAI | null = null;
  private geminiModel: any = null;
  private sampleRate = parseInt(process.env.AUDIO_SAMPLE_RATE || '16000');
  private localWhisperUrl = process.env.LOCAL_WHISPER_URL || 'http://localhost:8000/transcribe';

  constructor() {
    const configuredProvider = (process.env.STT_PROVIDER as STTProvider) || 'gemini';
    const key = process.env.GEMINI_API_KEY || '';
    const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

    if (configuredProvider === 'local-whisper') {
      this.provider = 'local-whisper';
      logger.info(`🎤 STT: Local Faster-Whisper Python server (${this.localWhisperUrl})`);
    } else if (key) {
      this.provider = 'gemini';
      this.genAI = new GoogleGenerativeAI(key);
      this.geminiModel = this.genAI.getGenerativeModel({ model: modelName });
      logger.info(`🎤 STT: Real Gemini Flash mode (${modelName}) initialized`);
    } else if (process.env.OPENAI_API_KEY) {
      this.provider = 'openai';
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      logger.info('🎤 STT: Real OpenAI Whisper mode initialized');
    } else {
      logger.warn('⚠️ No API Key set for STT — please set GEMINI_API_KEY in .env or Settings');
    }
  }

  updateApiKey(key: string, provider: STTProvider = 'gemini') {
    this.provider = provider;
    if (this.provider === 'local-whisper') {
      logger.info(`🎤 STT: Local Faster-Whisper Python server activated (${this.localWhisperUrl})`);
      return;
    }
    if (!key) return;
    
    if (this.provider === 'gemini') {
      const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
      this.genAI = new GoogleGenerativeAI(key);
      this.geminiModel = this.genAI.getGenerativeModel({ model: modelName });
      logger.info(`🎤 STT: Gemini Flash mode activated (${modelName})`);
    } else if (this.provider === 'openai') {
      this.openai = new OpenAI({ apiKey: key });
      logger.info('🎤 STT: OpenAI Whisper mode activated');
    }
  }

  async transcribe(audioChunk: Buffer): Promise<string | null> {
    try {
      if (this.provider === 'local-whisper') {
        return await this.transcribeWithLocalWhisper(audioChunk);
      } else if (this.provider === 'gemini' && this.genAI) {
        return await this.transcribeWithGemini(audioChunk);
      } else if (this.provider === 'openai' && this.openai) {
        return await this.transcribeWithOpenAI(audioChunk);
      }
      return null;
    } catch (err: any) {
      logger.error(`STT Error [${this.provider}]: ${err.message}`);
      return null;
    }
  }

  private async transcribeWithLocalWhisper(audioChunk: Buffer): Promise<string | null> {
    if (audioChunk.length < 1000) return null;
    try {
      const wavBuffer = this.pcmToWav(audioChunk);
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const formData = new FormData();
      formData.append('file', blob, 'audio.wav');

      const response = await fetch(this.localWhisperUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) return null;
      const data: any = await response.json();
      return data.text ? data.text.trim() : null;
    } catch (err: any) {
      logger.error(`Local Faster-Whisper Error: ${err.message}`);
      return null;
    }
  }

  private async transcribeWithOpenAI(audioChunk: Buffer): Promise<string | null> {
    if (audioChunk.length < 1000) return null;
    const tmpFile = path.join(os.tmpdir(), `ghost-audio-${Date.now()}.wav`);
    try {
      const wavBuffer = this.pcmToWav(audioChunk);
      fs.writeFileSync(tmpFile, wavBuffer);
      const transcription = await this.openai!.audio.transcriptions.create({
        file: fs.createReadStream(tmpFile),
        model: 'whisper-1',
        language: 'en',
        response_format: 'text',
      });
      return typeof transcription === 'string' ? transcription.trim() : null;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }

  private async transcribeWithGemini(audioChunk: Buffer): Promise<string | null> {
    if (audioChunk.length < 1600) return null; // minimum 0.05s of audio

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
    } catch (err: any) {
      logger.error(`Gemini STT Error: ${err.message}`);
      return null;
    }
  }

  private pcmToWav(pcmBuffer: Buffer): Buffer {
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
