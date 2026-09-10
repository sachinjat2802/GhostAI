"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMService = void 0;
const generative_ai_1 = require("@google/generative-ai");
const Logger_1 = require("../utils/Logger");
const logger = new Logger_1.Logger('LLMService');
const MODE_PROMPTS = {
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
class LLMService {
    genAI = null;
    provider = 'gemini';
    apiKey = '';
    modelName;
    lastCallTime = 0;
    minCallInterval = 150;
    constructor() {
        this.modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        this.apiKey = process.env.GEMINI_API_KEY || '';
        if (this.apiKey) {
            this.genAI = new generative_ai_1.GoogleGenerativeAI(this.apiKey);
            logger.info(`🧠 LLM: Google Gemini ${this.modelName} initialized`);
        }
        else {
            logger.warn('⚠️ GEMINI_API_KEY not set — please set GEMINI_API_KEY in .env or Settings');
        }
    }
    setProvider(_provider) {
        this.provider = 'gemini';
        logger.info(`🧠 LLM Provider locked to: gemini`);
    }
    getProvider() {
        return 'gemini';
    }
    setModelName(modelName) {
        if (!modelName)
            return;
        this.modelName = modelName;
        logger.info(`🧠 LLM model updated to: ${modelName}`);
    }
    updateApiKey(key, modelName) {
        if (modelName)
            this.modelName = modelName;
        if (!key)
            return;
        this.apiKey = key;
        this.genAI = new generative_ai_1.GoogleGenerativeAI(key);
        logger.info(`🧠 LLM: Gemini API key updated, model: ${this.modelName}`);
    }
    async getSuggestion(context, mode, resume, jobDescription, onToken, force = false) {
        const now = Date.now();
        if (!force && now - this.lastCallTime < this.minCallInterval)
            return null;
        this.lastCallTime = now;
        if (!this.genAI) {
            const key = this.apiKey || process.env.GEMINI_API_KEY || '';
            if (key) {
                this.apiKey = key;
                this.genAI = new generative_ai_1.GoogleGenerativeAI(key);
                logger.info(`🧠 LLM: Gemini lazy-initialized with process key`);
            }
            else {
                logger.error('⚠️ GEMINI_API_KEY missing');
                const errMsg = '⚠️ Gemini API Key not set. Please set GEMINI_API_KEY in .env or Settings (⚙️).';
                if (onToken)
                    onToken(errMsg);
                return errMsg;
            }
        }
        try {
            return await this.callGeminiStream(context, mode, resume, jobDescription, onToken);
        }
        catch (err) {
            logger.error(`LLM Call Error [gemini]:`, err);
            const errMsg = `⚠️ Gemini API Error: ${err.message || 'Request failed'}`;
            if (onToken)
                onToken(errMsg);
            return errMsg;
        }
    }
    async analyzeImage(base64Data, mode) {
        if (!this.genAI) {
            const key = this.apiKey || process.env.GEMINI_API_KEY || '';
            if (key) {
                this.apiKey = key;
                this.genAI = new generative_ai_1.GoogleGenerativeAI(key);
            }
            else {
                return "⚠️ Vision Analysis unavailable — please set API key in settings.";
            }
        }
        try {
            const base64 = base64Data.split(',')[1] || base64Data;
            const model = this.genAI.getGenerativeModel({
                model: this.modelName,
                systemInstruction: MODE_PROMPTS[mode],
            });
            const result = await model.generateContent([
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: base64,
                    },
                },
                {
                    text: 'Analyze the question, code snippet, or diagram on screen. Provide the exact solution, code fix, and Time/Space complexity in clean bullet points.',
                },
            ]);
            return result.response.text().trim();
        }
        catch (err) {
            logger.error('Image analysis error', err);
            return `⚠️ Analysis failed: ${err.message || 'Check API Key configuration.'}`;
        }
    }
    buildSystemInstruction(mode, resume, jobDescription) {
        let systemInstruction = MODE_PROMPTS[mode];
        if (mode === 'interview') {
            if (resume && resume.trim()) {
                systemInstruction += `\n\nCandidate Resume Context:\n"""\n${resume}\n"""\nAnswer using the candidate's actual experience in first-person voice ("I...").`;
            }
            if (jobDescription && jobDescription.trim()) {
                systemInstruction += `\n\nTarget Job Description:\n"""\n${jobDescription}\n"""\nAlign key terminology and technical points with this job description.`;
            }
        }
        return systemInstruction;
    }
    async prewarm() {
        if (!this.genAI)
            return;
        try {
            const model = this.genAI.getGenerativeModel({ model: this.modelName });
            model.generateContent('hi').catch(() => { });
            logger.info('⚡ Gemini LLM connection pre-warmed for ultra-low latency response');
        }
        catch { }
    }
    modelCache = new Map();
    getCachedModel(modelName, systemInstruction) {
        const key = `${modelName}:${systemInstruction || ''}`;
        if (!this.modelCache.has(key) && this.genAI) {
            this.modelCache.set(key, this.genAI.getGenerativeModel({ model: modelName, systemInstruction }));
        }
        return this.modelCache.get(key) || this.genAI.getGenerativeModel({ model: modelName, systemInstruction });
    }
    async callGeminiStream(context, mode, resume, jobDescription, onToken) {
        const systemInstruction = this.buildSystemInstruction(mode, resume, jobDescription);
        const model = this.getCachedModel(this.modelName, systemInstruction);
        const prompt = `Live Context:\n"${context}"\n\nProvide response:`;
        const result = await model.generateContentStream({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: 120,
                temperature: 0.2,
                topP: 0.8,
                topK: 20,
            },
        });
        const tokenParts = [];
        for await (const chunk of result.stream) {
            const text = chunk.text();
            tokenParts.push(text);
            if (onToken)
                onToken(text);
        }
        return tokenParts.join('').trim();
    }
}
exports.LLMService = LLMService;
//# sourceMappingURL=LLMService.js.map