// Web Worker for WebSocket broadcasting
// Handles WebSocket connection and sends data at 30Hz (not throttled in background tabs)

const BROADCAST_INTERVAL = 1000 / 30; // 30Hz
const RECONNECT_INTERVAL = 2000; // 2 seconds

let ws = null;
let connected = false;
let reconnectTimer = null;
let latestPeopleData = null;
let wsUrl = 'ws://localhost:8080';
let enabled = true;

// Connect to WebSocket server
function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    console.log(`[Worker WS] Attempting to connect to ${wsUrl}...`);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[Worker WS] Connected');
      connected = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      // Notify main thread
      postMessage({ type: 'connected' });
    };

    ws.onclose = () => {
      console.log('[Worker WS] Disconnected');
      connected = false;
      scheduleReconnect();

      // Notify main thread
      postMessage({ type: 'disconnected' });
    };

    ws.onerror = (error) => {
      console.log('[Worker WS] Connection error (will retry)');
      connected = false;
    };

    ws.onmessage = (event) => {
      console.log('[Worker WS] Received:', event.data);
      // Forward to main thread if needed
      postMessage({ type: 'message', data: event.data });
    };

  } catch (error) {
    console.log('[Worker WS] Failed to create connection (will retry)');
    connected = false;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (!reconnectTimer) {
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_INTERVAL);
  }
}

// Broadcast loop - runs at 30Hz
let broadcastCount = 0;
let lastBroadcastLog = Date.now();

setInterval(() => {
  broadcastCount++;

  // Log every 30 broadcasts (once per second)
  if (Date.now() - lastBroadcastLog > 1000) {
    console.log(`[Worker WS] Broadcast rate: ${broadcastCount} msgs/sec, enabled: ${enabled}, connected: ${connected}, hasData: ${latestPeopleData ? latestPeopleData.length : 0}`);
    broadcastCount = 0;
    lastBroadcastLog = Date.now();
  }

  if (!enabled || !connected || !latestPeopleData || latestPeopleData.length === 0) {
    return;
  }

  const payload = {
    type: 'people_locations',
    timestamp: Date.now(),
    people: latestPeopleData
  };

  try {
    ws.send(JSON.stringify(payload));
  } catch (error) {
    console.error('[Worker WS] Send error:', error);
  }
}, BROADCAST_INTERVAL);

// Listen for messages from main thread
self.onmessage = (e) => {
  const { type, data } = e.data;

  switch (type) {
    case 'init':
      // Initialize with URL and enabled state
      if (data.url) wsUrl = data.url;
      if (data.enabled !== undefined) enabled = data.enabled;
      connect();
      console.log('[Worker WS] Initialized - broadcast at 30Hz');
      break;

    case 'updatePeople':
      // Receive latest people data from main thread
      latestPeopleData = data;
      break;

    case 'setEnabled':
      enabled = data;
      console.log('[Worker WS] Enabled:', enabled);
      break;

    case 'disconnect':
      if (ws) {
        ws.close();
        ws = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      connected = false;
      break;
  }
};

console.log('[Worker WS] WebSocket broadcast worker loaded');
