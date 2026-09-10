import { EventEmitter } from 'events';
/**
 * AudioPipeline
 * - Captures real microphone audio using SoX or WebAudio HTML5 capture
 * - Emits 'chunk' events with raw PCM buffers
 */
export declare class AudioPipeline extends EventEmitter {
    private recording;
    private soxProcess;
    private chunkBuffer;
    private chunkIntervalMs;
    private sampleRate;
    private chunkTimer;
    start(): void;
    stop(): void;
    private startCapture;
    private startWithSox;
    isRecording(): boolean;
}
//# sourceMappingURL=AudioPipeline.d.ts.map