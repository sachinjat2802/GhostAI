import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Logger } from '../utils/Logger';

const logger = new Logger('AudioPipeline');

/**
 * AudioPipeline
 * - Captures real microphone audio using SoX or WebAudio HTML5 capture
 * - Emits 'chunk' events with raw PCM buffers
 */
export class AudioPipeline extends EventEmitter {
  private recording = false;
  private soxProcess: ChildProcess | null = null;
  private chunkBuffer: Buffer[] = [];
  private chunkIntervalMs = parseInt(process.env.AUDIO_CHUNK_MS || '450');
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
      this.startWithSox();
    } catch (e) {
      logger.info('ℹ️ SoX process unavailable — relying on real WebAudio capture from overlay UI.');
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

    let bufferList: Buffer[] = [];
    let bufferTotalLen = 0;

    this.soxProcess.stdout.on('data', (data: Buffer) => {
      bufferList.push(data);
      bufferTotalLen += data.length;
    });

    this.soxProcess.on('error', (err) => {
      logger.info(`SoX stream info: ${err.message} — using real WebAudio capture`);
      if (this.soxProcess) {
        try { this.soxProcess.kill(); } catch {}
        this.soxProcess = null;
      }
    });

    // Emit chunks at intervals
    this.chunkTimer = setInterval(() => {
      if (bufferTotalLen > 0 && this.recording) {
        const chunk = Buffer.concat(bufferList, bufferTotalLen);
        bufferList = [];
        bufferTotalLen = 0;
        logger.debug(`📦 Audio chunk: ${chunk.length} bytes`);
        this.emit('chunk', chunk);
      }
    }, this.chunkIntervalMs);
  }

  isRecording() {
    return this.recording;
  }
}
