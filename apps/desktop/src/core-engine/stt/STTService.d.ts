export type STTProvider = 'gemini' | 'openai' | 'local-whisper';
export declare class STTService {
    private provider;
    private openai;
    private genAI;
    private geminiModel;
    private sampleRate;
    private localWhisperUrl;
    constructor();
    updateApiKey(key: string, provider?: STTProvider): void;
    transcribe(audioChunk: Buffer): Promise<string | null>;
    private transcribeWithLocalWhisper;
    private transcribeWithOpenAI;
    private transcribeWithGemini;
    private pcmToWav;
}
//# sourceMappingURL=STTService.d.ts.map