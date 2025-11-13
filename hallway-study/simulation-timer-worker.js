// Web Worker for reliable 30Hz timer (not throttled in background tabs)
// This worker just sends tick messages at a fixed rate

const TICK_INTERVAL = 1000 / 30; // 30Hz

let lastTime = Date.now();
let tickCount = 0;
let lastTickLog = Date.now();

setInterval(() => {
  const now = Date.now();
  const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap at 0.1s
  lastTime = now;
  tickCount++;

  // Log every second
  if (now - lastTickLog > 1000) {
    console.log(`[Worker Sim] Tick rate: ${tickCount} ticks/sec`);
    tickCount = 0;
    lastTickLog = now;
  }

  // Send tick message to main thread
  postMessage({
    type: 'tick',
    timestamp: now,
    deltaTime: deltaTime
  });
}, TICK_INTERVAL);

console.log('[Worker Sim] Simulation timer worker started at 30Hz');
