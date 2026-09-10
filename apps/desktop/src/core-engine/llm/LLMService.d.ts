import { AssistantMode } from '../context/ContextService';
export type LLMProvider = 'gemini';
export declare class LLMService {
    private genAI;
    private provider;
    private apiKey;
    private modelName;
    private lastCallTime;
    private minCallInterval;
    constructor();
    setProvider(_provider: LLMProvider): void;
    getProvider(): LLMProvider;
    setModelName(modelName: string): void;
    updateApiKey(key: string, modelName?: string): void;
    getSuggestion(context: string, mode: AssistantMode, resume?: string, jobDescription?: string, onToken?: (token: string) => void, force?: boolean): Promise<string | null>;
    analyzeImage(base64Data: string, mode: AssistantMode): Promise<string | null>;
    private buildSystemInstruction;
    prewarm(): Promise<void>;
    private modelCache;
    private getCachedModel;
    private callGeminiStream;
}
//# sourceMappingURL=LLMService.d.ts.map