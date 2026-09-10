import { Logger } from '../utils/Logger';

const logger = new Logger('ContextService');

export type AssistantMode = 'interview' | 'meeting' | 'coding' | 'general';

interface TranscriptEntry {
  text: string;
  timestamp: number;
}

/**
 * Optimized Circular Ring Buffer for O(1) Push and Read operations
 */
class CircularBuffer<T> {
  private buffer: (T | null)[];
  private capacity: number;
  private head = 0;
  private tail = 0;
  private count = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
  }

  push(item: T) {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity; // Overwrite oldest
    }
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      const val = this.buffer[idx];
      if (val !== null) result.push(val);
    }
    return result;
  }

  clear() {
    this.buffer.fill(null);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  size(): number {
    return this.count;
  }
}

export class ContextService {
  private ringBuffer = new CircularBuffer<TranscriptEntry>(30);
  private mode: AssistantMode = (process.env.DEFAULT_MODE as AssistantMode) || 'interview';
  private resumeText = '';
  private jobDescriptionText = '';
  private historyRing = new CircularBuffer<{ role: 'user' | 'assistant' | 'transcript'; text: string; timestamp: number }>(100);
  private lastInsertedText = '';

  setResume(text: string) {
    this.resumeText = text;
    logger.info(`📋 Resume context updated: ${text.length} chars`);
  }

  getResume(): string {
    return this.resumeText;
  }

  setJobDescription(text: string) {
    this.jobDescriptionText = text;
    logger.info(`💼 Job description updated: ${text.length} chars`);
  }

  getJobDescription(): string {
    return this.jobDescriptionText;
  }

  /**
   * O(1) Push with String Deduplication
   */
  addTranscript(text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed === this.lastInsertedText) return; // Deduplicate identical consecutive entries
    this.lastInsertedText = trimmed;

    const entry = { text: trimmed, timestamp: Date.now() };
    this.ringBuffer.push(entry);
    this.historyRing.push({ role: 'transcript', text: trimmed, timestamp: Date.now() });

    logger.debug(`📝 Context ring size: ${this.ringBuffer.size()}/30`);
  }

  addSuggestion(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.historyRing.push({ role: 'assistant', text: trimmed, timestamp: Date.now() });
  }

  /**
   * Fast O(K) Context String Builder (K <= 20) — Single Array Join
   */
  getContext(): string {
    const entries = this.ringBuffer.toArray();
    const startIdx = Math.max(0, entries.length - 20);
    const parts: string[] = [];
    for (let i = startIdx; i < entries.length; i++) {
      parts.push(entries[i].text);
    }
    return parts.join(' ');
  }

  getContextStructured() {
    const entries = this.ringBuffer.toArray();
    const last20 = entries.length > 20 ? entries.slice(entries.length - 20) : entries;
    return {
      mode: this.mode,
      entries: last20,
      summary: last20.map((e) => e.text).join(' '),
      hasResume: Boolean(this.resumeText),
      hasJobDescription: Boolean(this.jobDescriptionText),
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
    this.ringBuffer.clear();
    this.historyRing.clear();
    this.lastInsertedText = '';
    logger.info('🗑️ Context cleared');
  }

  getSize() {
    return this.ringBuffer.size();
  }

  exportMarkdown(): string {
    const lines: string[] = [
      `# Ghost AI Session Export — ${new Date().toLocaleString()}`,
      '',
      `**Mode:** ${this.mode.toUpperCase()}`,
    ];
    if (this.resumeText) lines.push(`**Resume Provided:** Yes (${this.resumeText.length} chars)`);
    if (this.jobDescriptionText) lines.push(`**Job Description Provided:** Yes (${this.jobDescriptionText.length} chars)`);
    lines.push('', '---', '', '## Session Timeline', '');

    const history = this.historyRing.toArray();
    if (history.length === 0) {
      lines.push('*No activity recorded in this session.*');
    } else {
      for (let i = 0; i < history.length; i++) {
        const item = history[i];
        const time = new Date(item.timestamp).toLocaleTimeString();
        if (item.role === 'transcript') {
          lines.push(`> 🎙️ **[${time}] Live Audio:** ${item.text}`, '');
        } else if (item.role === 'assistant') {
          lines.push(`### 💡 AI Suggestion [${time}]\n${item.text}`, '');
        } else {
          lines.push(`**[${time}] User:** ${item.text}`, '');
        }
      }
    }

    return lines.join('\n');
  }
  exportJSON(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        mode: this.mode,
        resumeLength: this.resumeText.length,
        jobDescriptionLength: this.jobDescriptionText.length,
        history: this.historyRing.toArray(),
      },
      null,
      2
    );
  }
}
