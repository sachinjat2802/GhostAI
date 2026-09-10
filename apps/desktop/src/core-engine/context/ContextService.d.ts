export type AssistantMode = 'interview' | 'meeting' | 'coding' | 'general';
interface TranscriptEntry {
    text: string;
    timestamp: number;
}
export declare class ContextService {
    private ringBuffer;
    private mode;
    private resumeText;
    private jobDescriptionText;
    private historyRing;
    private lastInsertedText;
    setResume(text: string): void;
    getResume(): string;
    setJobDescription(text: string): void;
    getJobDescription(): string;
    /**
     * O(1) Push with String Deduplication
     */
    addTranscript(text: string): void;
    addSuggestion(text: string): void;
    /**
     * Fast O(K) Context String Builder (K <= 20) — Single Array Join
     */
    getContext(): string;
    getContextStructured(): {
        mode: AssistantMode;
        entries: TranscriptEntry[];
        summary: string;
        hasResume: boolean;
        hasJobDescription: boolean;
    };
    setMode(mode: AssistantMode): void;
    getMode(): AssistantMode;
    clear(): void;
    getSize(): number;
    exportMarkdown(): string;
    exportJSON(): string;
}
export {};
//# sourceMappingURL=ContextService.d.ts.map