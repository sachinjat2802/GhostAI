import 'dotenv/config';
import { LLMService } from './src/llm/LLMService';

async function runTest() {
  console.log('🧪 Starting LLMService Test with Gemini...');
  const llm = new LLMService();
  
  const testQuestion = 'How would you design a scalable microservices architecture?';
  console.log(`\n🗣️ Simulated Interviewer Question: "${testQuestion}"`);
  console.log(`⏱️ Waiting for Gemini 1.5 Flash...`);
  
  const answer = await llm.getSuggestion(testQuestion, 'interview');
  
  console.log('\n--- 👻 GHOST AI DIRECT ANSWER ---');
  console.log(answer);
  console.log('---------------------------------\n');
}

runTest().catch(console.error);
