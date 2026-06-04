import { Logger } from '../utils/Logger';

const logger = new Logger('ContextService');

export type AssistantMode = 'interview' | 'meeting' | 'coding' | 'general';

interface TranscriptEntry {
  text: string;
  timestamp: number;
}

export class ContextService {
  private buffer: TranscriptEntry[] = [];
  private maxSize = parseInt(process.env.CONTEXT_BUFFER_SIZE || '50');
  private mode: AssistantMode = (process.env.DEFAULT_MODE as AssistantMode) || 'interview';
  private resumeText = '';

  setResume(text: string) {
    this.resumeText = text;
    logger.info(`📋 Resume context updated: ${text.length} characters`);
  }

  getResume(): string {
    return this.resumeText;
  }

  addTranscript(text: string) {
    this.buffer.push({ text: text.trim(), timestamp: Date.now() });

    // Trim old entries
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }

    logger.debug(`📝 Context size: ${this.buffer.length}/${this.maxSize}`);
  }

  getContext(): string {
    // Return last 30 seconds of context (or last 20 entries)
    const recent = this.buffer.slice(-20);
    return recent.map((e) => e.text).join(' ');
  }

  getContextStructured() {
    return {
      mode: this.mode,
      entries: this.buffer.slice(-20),
      summary: this.getContext(),
    };
  }

  setMode(mode: AssistantMode) {
    this.mode = mode;
    logger.info(`🔄 Mode set to: ${mode}`);
  }

  getMode(): AssistantMode {
    return this.mode;
  }

  clear() {
    this.buffer = [];
    logger.info('🗑️ Context cleared');
  }

  getSize() {
    return this.buffer.length;
  }
}
