import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Logger } from '../utils/Logger';

const logger = new Logger('AudioPipeline');

/**
 * AudioPipeline
 * - Captures microphone in real-time using SoX (if available) or node-mic
 * - Falls back to a mock/file-based input for development
 * - Emits 'chunk' events with raw PCM buffers
 */
export class AudioPipeline extends EventEmitter {
  private recording = false;
  private soxProcess: ChildProcess | null = null;
  private chunkBuffer: Buffer[] = [];
  private chunkIntervalMs = parseInt(process.env.AUDIO_CHUNK_MS || '1500');
  private sampleRate = parseInt(process.env.AUDIO_SAMPLE_RATE || '16000');
  private chunkTimer: ReturnType<typeof setInterval> | null = null;

  start() {
    if (this.recording) return;
    this.recording = true;
    logger.info(`🎤 Audio pipeline starting (chunk: ${this.chunkIntervalMs}ms)`);
    this.startCapture();
  }

  stop() {
    if (!this.recording) return;
    this.recording = false;
    if (this.soxProcess) {
      this.soxProcess.kill();
      this.soxProcess = null;
    }
    if (this.chunkTimer) {
      clearInterval(this.chunkTimer);
      this.chunkTimer = null;
    }
    logger.info('🔇 Audio pipeline stopped');
  }

  private startCapture() {
    try {
      // Try using SoX (rec command) for audio capture
      this.startWithSox();
    } catch (e) {
      logger.warn('⚠️ SoX not found, falling back to mock audio mode');
      this.startMockMode();
    }
  }

  private startWithSox() {
    // Path to sox_ng installed via winget
    const soxDirName = 'sox_ng.sox_ng_Microsoft.Winget.Source_8wekyb3d8bbwe';
    const soxPath = process.env.LOCALAPPDATA 
      ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages', soxDirName, 'sox_ng.exe')
      : 'sox_ng'; // fallback 
    
    // SoX_ng command: -d (default device) to record to stdout as raw PCM
    const args = [
      '-d',           // default device recording
      '-q',           // quiet
      '-t', 'raw',    // raw PCM output
      '-r', String(this.sampleRate),
      '-e', 'signed',
      '-b', '16',     // 16-bit
      '-c', '1',      // mono
      '-',            // output to stdout
    ];

    logger.info(`🎙️ Starting SoX capture via ${soxPath}...`);
    this.soxProcess = spawn(soxPath, args, { stdio: ['ignore', 'pipe', 'ignore'] });

    if (!this.soxProcess.stdout) {
      throw new Error('SoX failed to start');
    }

    let accBuffer = Buffer.alloc(0);

    this.soxProcess.stdout.on('data', (data: Buffer) => {
      accBuffer = Buffer.concat([accBuffer, data]);
    });

    this.soxProcess.on('error', (err) => {
      logger.warn(`SoX error: ${err.message} — switching to mock mode`);
      if (this.soxProcess) {
        try { this.soxProcess.kill(); } catch {}
        this.soxProcess = null;
      }
      this.startMockMode();
    });

    // Emit chunks at intervals
    this.chunkTimer = setInterval(() => {
      if (accBuffer.length > 0 && this.recording) {
        const chunk = accBuffer;
        accBuffer = Buffer.alloc(0);
        logger.debug(`📦 Audio chunk: ${chunk.length} bytes`);
        this.emit('chunk', chunk);
      }
    }, this.chunkIntervalMs);
  }

  /**
   * Mock mode: used when no real mic is available (dev/testing)
   * Simply emits silence buffers so the rest of the pipeline works
   */
  private startMockMode() {
    logger.warn('🔕 MOCK AUDIO MODE — no real audio captured');
    logger.warn('   Install SoX (https://sox.sourceforge.net) for real audio');

    if (this.chunkTimer) {
      clearInterval(this.chunkTimer);
      this.chunkTimer = null;
    }

    this.chunkTimer = setInterval(() => {
      if (!this.recording) return;
      // Emit 1 second of silence (16000 samples * 2 bytes = 32000 bytes)
      const silence = Buffer.alloc(this.sampleRate * 2);
      this.emit('chunk', silence);
    }, this.chunkIntervalMs);
  }

  isRecording() {
    return this.recording;
  }
}
