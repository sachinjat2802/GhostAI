import { EventBus } from './src/utils/EventBus';

const eventBus = new EventBus();
let llmTimer: any = null;

eventBus.on('stt:transcript', (text: string) => {
  console.log(`[stt:transcript] Received: ${text}`);
  if (llmTimer) clearTimeout(llmTimer);
  llmTimer = setTimeout(() => {
    console.log(`[Timer Fired] Calling LLM after 3000ms...`);
  }, 3000);
});

console.log('Simulating STT... (Emitting "hello" every 1500ms, but only forwarding to EventBus every 5th time)');

let tick = 0;
setInterval(() => {
  tick++;
  console.log(`Tick ${tick} (1500ms elapsed)`);
  if (tick % 5 === 0) {
    eventBus.emit('stt:transcript', `Test Phrase ${tick}`);
  }
}, 1500);
