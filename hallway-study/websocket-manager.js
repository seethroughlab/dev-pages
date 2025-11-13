// ===== WebSocket Client Manager =====
// Connects to a local WebSocket server and broadcasts people location data

export class WebSocketManager {
  constructor(url = 'ws://localhost:8080') {
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.reconnectInterval = 2000; // Try reconnecting every 2 seconds
    this.reconnectTimer = null;
    this.messageQueue = [];
    this.maxQueueSize = 100; // Don't let queue grow indefinitely

    // Start connection attempt
    this.connect();
  }

  connect() {
    // Don't try to connect if already connected or connecting
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      console.log(`[WebSocket] Attempting to connect to ${this.url}...`);
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.connected = true;

        // Clear reconnect timer if it was running
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Send any queued messages
        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift();
          this.ws.send(msg);
        }
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.connected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.log('[WebSocket] Connection error (will retry)');
        this.connected = false;
      };

      this.ws.onmessage = (event) => {
        // Handle incoming messages if needed
        console.log('[WebSocket] Received:', event.data);
      };

    } catch (error) {
      console.log('[WebSocket] Failed to create connection (will retry)');
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    // Only schedule if not already scheduled
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, this.reconnectInterval);
    }
  }

  send(data) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);

    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      // Send immediately if connected
      this.ws.send(message);
    } else {
      // Queue the message for when we reconnect
      this.messageQueue.push(message);

      // Prevent queue from growing too large
      if (this.messageQueue.length > this.maxQueueSize) {
        this.messageQueue.shift(); // Remove oldest message
      }
    }
  }

  // Broadcast people locations
  broadcastPeople(people) {
    if (people.length === 0) return;

    const payload = {
      type: 'people_locations',
      timestamp: Date.now(),
      people: people.map(person => this.serializePerson(person))
    };

    this.send(payload);
  }

  // Serialize a person object to the required format
  serializePerson(person) {
    // Calculate dimensions
    const width = person.radius * 2; // Diameter
    const height = person.height;

    // Calculate velocities
    const xvel = person.xVelocity || 0; // Lateral velocity
    const yvel = person.isDwelling ? 0 : (person.speed * person.direction); // Forward velocity

    // Position (use world coordinates)
    // x = lateral position in hallway
    // y = bottom of person (on floor)
    // z = position along hallway (but we'll use z as y for 2D tracking)
    const x = person.xOffset;
    const y = person.z; // Using z-position as y for top-down view

    return {
      id: person.id,
      x: parseFloat(x.toFixed(4)),
      y: parseFloat(y.toFixed(4)),
      w: parseFloat(width.toFixed(4)),
      h: parseFloat(height.toFixed(4)),
      xvel: parseFloat(xvel.toFixed(4)),
      yvel: parseFloat(yvel.toFixed(4))
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
  }

  isConnected() {
    return this.connected;
  }
}
