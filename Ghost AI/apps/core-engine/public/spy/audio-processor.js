/**
 * Ghost AI — High Performance AudioWorkletProcessor
 * Runs on dedicated WebAudio thread for 0-lag main-thread audio framing and VAD.
 */
class GhostAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.pcmBuffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
    this.vadThreshold = 0.015;
    this.isSpeaking = false;
    this.speechChunks = [];
    this.silenceSamples = 0;
    this.sampleRate = 16000;

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'SET_VAD_THRESHOLD') {
        this.vadThreshold = event.data.threshold;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const channelData = input[0];
    const len = channelData.length;

    let sum = 0;
    for (let i = 0; i < len; i++) {
      const sample = channelData[i];
      sum += sample * sample;

      // Single-pass clamping & 16-bit PCM conversion
      const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
      this.pcmBuffer[this.bufferIndex++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

      if (this.bufferIndex >= this.bufferSize) {
        this.flushBuffer();
      }
    }

    const rms = Math.sqrt(sum / len);
    this.port.postMessage({ type: 'RMS_UPDATE', rms });

    return true;
  }

  flushBuffer() {
    if (this.bufferIndex === 0) return;

    const chunkToSend = this.pcmBuffer.slice(0, this.bufferIndex);
    this.bufferIndex = 0;

    // Post zero-copy transferable ArrayBuffer to main thread
    this.port.postMessage(
      { type: 'AUDIO_CHUNK', buffer: chunkToSend.buffer },
      [chunkToSend.buffer]
    );
  }
}

registerProcessor('ghost-audio-processor', GhostAudioProcessor);
