import { LLMService } from './src/llm/LLMService';
import 'dotenv/config';

async function test() {
  const svc = new LLMService();
  try {
    const res = await svc.analyzeImage('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'coding');
    console.log("Result:", res);
  } catch (err) {
    console.error("Caught error:", err);
  }
}
test();
