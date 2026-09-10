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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioPipeline = void 0;
const events_1 = require("events");
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const Logger_1 = require("../utils/Logger");
const logger = new Logger_1.Logger('AudioPipeline');
/**
 * AudioPipeline
 * - Captures real microphone audio using SoX or WebAudio HTML5 capture
 * - Emits 'chunk' events with raw PCM buffers
 */
class AudioPipeline extends events_1.EventEmitter {
    recording = false;
    soxProcess = null;
    chunkBuffer = [];
    chunkIntervalMs = parseInt(process.env.AUDIO_CHUNK_MS || '450');
    sampleRate = parseInt(process.env.AUDIO_SAMPLE_RATE || '16000');
    chunkTimer = null;
    start() {
        if (this.recording)
            return;
        this.recording = true;
        logger.info(`🎤 Audio pipeline starting (chunk: ${this.chunkIntervalMs}ms)`);
        this.startCapture();
    }
    stop() {
        if (!this.recording)
            return;
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
    startCapture() {
        try {
            this.startWithSox();
        }
        catch (e) {
            logger.info('ℹ️ SoX process unavailable — relying on real WebAudio capture from overlay UI.');
        }
    }
    startWithSox() {
        // Path to sox_ng installed via winget
        const soxDirName = 'sox_ng.sox_ng_Microsoft.Winget.Source_8wekyb3d8bbwe';
        const soxPath = process.env.LOCALAPPDATA
            ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages', soxDirName, 'sox_ng.exe')
            : 'sox_ng'; // fallback 
        // SoX_ng command: -d (default device) to record to stdout as raw PCM
        const args = [
            '-d', // default device recording
            '-q', // quiet
            '-t', 'raw', // raw PCM output
            '-r', String(this.sampleRate),
            '-e', 'signed',
            '-b', '16', // 16-bit
            '-c', '1', // mono
            '-', // output to stdout
        ];
        logger.info(`🎙️ Starting SoX capture via ${soxPath}...`);
        this.soxProcess = (0, child_process_1.spawn)(soxPath, args, { stdio: ['ignore', 'pipe', 'ignore'] });
        if (!this.soxProcess.stdout) {
            throw new Error('SoX failed to start');
        }
        let bufferList = [];
        let bufferTotalLen = 0;
        this.soxProcess.stdout.on('data', (data) => {
            bufferList.push(data);
            bufferTotalLen += data.length;
        });
        this.soxProcess.on('error', (err) => {
            logger.info(`SoX stream info: ${err.message} — using real WebAudio capture`);
            if (this.soxProcess) {
                try {
                    this.soxProcess.kill();
                }
                catch { }
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
exports.AudioPipeline = AudioPipeline;
//# sourceMappingURL=AudioPipeline.js.map