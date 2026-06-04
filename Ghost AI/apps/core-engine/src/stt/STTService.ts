import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from '../utils/Logger';

const logger = new Logger('STTService');

export type STTProvider = 'openai' | 'gemini' | 'mock';

export class STTService {
  private provider: STTProvider;
  private openai: OpenAI | null = null;
  private genAI: GoogleGenerativeAI | null = null;
  private geminiModel: any = null;
  private sampleRate = parseInt(process.env.AUDIO_SAMPLE_RATE || '16000');

  constructor() {
    this.provider = (process.env.STT_PROVIDER as STTProvider) || 'openai';

    if (this.provider === 'openai') {
      if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
        logger.warn('⚠️ OPENAI_API_KEY not set — falling back to Gemini/Mock');
        this.provider = process.env.GEMINI_API_KEY ? 'gemini' : 'mock';
      } else {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        logger.info('🎤 STT: OpenAI Whisper mode');
      }
    }

    if (this.provider === 'gemini') {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
        logger.warn('⚠️ GEMINI_API_KEY not set — falling back to mock STT');
        this.provider = 'mock';
      } else {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.geminiModel = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        logger.info('🎤 STT: Gemini Flash mode');
      }
    }

    if (this.provider === 'mock') {
      logger.warn('🎤 STT: MOCK mode — will return fake transcripts');
    }
  }

  updateApiKey(key: string) {
    if (!key) return;
    if (this.provider === 'mock') {
      this.provider = 'gemini'; // default upgrade path
    }
    if (this.provider === 'gemini') {
      this.genAI = new GoogleGenerativeAI(key);
      this.geminiModel = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      logger.info('🎤 STT: Gemini Flash mode activated via updated key');
    } else if (this.provider === 'openai') {
      this.openai = new OpenAI({ apiKey: key });
      logger.info('🎤 STT: OpenAI Whisper mode activated via updated key');
    }
  }

  async transcribe(audioChunk: Buffer): Promise<string | null> {
    if (this.provider === 'mock') {
      return this.mockTranscribe();
    }

    try {
      if (this.provider === 'openai') {
        return await this.transcribeWithOpenAI(audioChunk);
      } else if (this.provider === 'gemini') {
        return await this.transcribeWithGemini(audioChunk);
      }
      return null;
    } catch (err: any) {
      logger.error(`STT error: ${err.message}`);
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
    // Gemini handles audio well, but we should avoid sending tiny chunks
    if (audioChunk.length < 8000) return null; // approx 0.25s of 16kHz audio

    try {
      const wavBuffer = this.pcmToWav(audioChunk);
      if (!this.geminiModel && this.genAI) {
        this.geminiModel = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      }
      const model = this.geminiModel;

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'audio/wav',
            data: wavBuffer.toString('base64')
          }
        },
        { text: "Transcribe the audio accurately. If there is no speech, return an empty string. Only return the transcription, no extra text." }
      ]);

      const text = result.response.text().trim();
      return text || null;
    } catch (err: any) {
      logger.error(`Gemini STT error: ${err.message}`);
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
    const wavBuffer = Buffer.alloc(headerSize + dataSize);

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

  private mockTranscribeCount = 0;
  private mockPhrases = [
    'Tell me about your experience with TypeScript',
    'How would you design a scalable microservices architecture',
    'What is your approach to handling technical debt',
    'Can you explain the difference between REST and GraphQL',
    'How do you handle state management in large applications',
    'What are your thoughts on test-driven development',
    'Describe a challenging project you worked on recently',
  ];

  private mockTranscribe(): string | null {
    this.mockTranscribeCount++;
    if (this.mockTranscribeCount % 5 !== 0) return null;
    const phrase = this.mockPhrases[Math.floor(Math.random() * this.mockPhrases.length)];
    logger.debug(`🤖 [MOCK STT] → "${phrase}"`);
    return phrase;
  }
}
