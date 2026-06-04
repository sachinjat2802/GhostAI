import { GoogleGenerativeAI } from '@google/generative-ai';
import { AssistantMode } from '../context/ContextService';
import { Logger } from '../utils/Logger';

const logger = new Logger('LLMService');

const MODE_PROMPTS: Record<AssistantMode, string> = {
  interview: `You are an invisible teleprompter for a candidate in a live job interview.
When you hear an interview question, DO NOT give meta-suggestions like "You should mention X".
Instead, provide the EXACT answer they should say out loud. Write it in the first-person ("I...").
Keep it clear, professional, and concise (2-3 sentences max). Ignore casual chat.`,

  meeting: `You are a meeting summarizer. 
Based on the transcript, provide a concise summary including:
- Key topics discussed
- Decisions made
- Action items
Keep it bulleted and very clear.`,

  coding: `You are a technical assistant. 
When provided with a code question (transcript or image), provide the direct solution or fix.
If an image is provided, analyze the code or error on screen and explain how to solve it.`,

  general: `You are a helpful AI assistant. 
Answer questions directly and accurately. Be concise.`,
};

export class LLMService {
  private genAI: GoogleGenerativeAI | null = null;
  private modelName: string;
  private isMock = false;
  private lastCallTime = 0;
  private minCallInterval = 1000; // lower for more responsiveness

  constructor() {
    this.modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      logger.warn('⚠️ GEMINI_API_KEY not set — LLM in MOCK mode');
      this.isMock = true;
    } else {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      logger.info(`🧠 LLM: Gemini ${this.modelName}`);
    }
  }

  updateApiKey(key: string) {
    if (!key) return;
    this.isMock = false;
    this.genAI = new GoogleGenerativeAI(key);
    logger.info(`🧠 LLM: Gemini key updated, model: ${this.modelName}`);
  }

  async getSuggestion(context: string, mode: AssistantMode, resume?: string): Promise<string | null> {
    if (this.isMock) return this.mockSuggestion(context, mode);

    const now = Date.now();
    if (now - this.lastCallTime < this.minCallInterval) return null;
    this.lastCallTime = now;

    try {
      return await this.callGemini(context, mode, resume);
    } catch (err: any) {
      logger.error('Gemini error', err);
      return null;
    }
  }

  async analyzeImage(base64Data: string, mode: AssistantMode): Promise<string | null> {
    if (this.isMock) return "Mock analysis: I see some code on your screen.";

    try {
      // Extract data after "base64," if present
      const base64 = base64Data.split(',')[1] || base64Data;
      
      const model = this.genAI!.getGenerativeModel({ 
        model: this.modelName,
        systemInstruction: MODE_PROMPTS[mode]
      });

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'image/png',
            data: base64
          }
        },
        { text: "Analyze the question or code on the screen and provide the direct solution." }
      ]);

      return result.response.text().trim();
    } catch (err: any) {
      logger.error('Image analysis error', err);
      return "Analysis failed.";
    }
  }

  private async callGemini(context: string, mode: AssistantMode, resume?: string): Promise<string> {
    let systemInstruction = MODE_PROMPTS[mode];
    if (mode === 'interview' && resume && resume.trim()) {
      systemInstruction += `\n\nCandidate's resume/profile to personalize response:\n"""\n${resume}\n"""\nUse the candidate's experience and skills in the resume to tailor the answer. If the resume doesn't cover the specific question topic, fall back to standard best practice answers in first-person without mentioning the lack of info.`;
    }

    const model = this.genAI!.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemInstruction,
    });

    const prompt = `Recent context:\n"${context}"\n\nProvide the response.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.7,
      }
    });

    return result.response.text().trim();
  }

  private mockResponses: Record<AssistantMode, string[]> = {
    interview: [
      '✅ Mention your experience with TypeScript generics and how you\'ve used them to improve type safety in large codebases.',
      '💡 Talk about a specific project: describe the problem, your approach, and the measurable outcome.',
      '🔑 Key point: Emphasize your ability to work with distributed teams and asynchronous communication.',
      '📌 For system design: Start with requirements → high-level → components → data flow → trade-offs.',
    ],
    meeting: [
      '📋 Key action items: Schedule follow-up, assign owners, set deadline.',
      '💡 Suggestion: Table this discussion for async — document it in Confluence and reconnect next sprint.',
      '🎯 Decision needed: The team needs to align on whether to proceed with option A or B by EOD.',
    ],
    coding: [
      '💻 Use a HashMap for O(1) lookup instead of nested loops. Time complexity goes from O(n²) to O(n).',
      '⚡ Consider using Promise.all() for parallel async operations instead of sequential awaits.',
      '🔧 Binary search would solve this in O(log n) — the array is already sorted.',
    ],
    general: [
      '💡 That\'s a complex topic — let me break it down into 3 key points for clarity.',
      '🎯 The core question here seems to be about trade-offs between performance and maintainability.',
      '✅ Based on context, the recommended approach would be to start with the simplest solution first.',
    ],
  };

  private mockSuggestion(context: string, mode: AssistantMode): string {
    const responses = this.mockResponses[mode];
    const suggestion = responses[Math.floor(Math.random() * responses.length)];
    logger.debug(`🤖 [MOCK LLM] → ${suggestion.substring(0, 60)}...`);
    return suggestion;
  }
}
