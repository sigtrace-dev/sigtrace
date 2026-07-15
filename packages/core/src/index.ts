import { TraceEvent } from './types.js';

declare global {
  const __SIGTRACE_PORT__: number | undefined;
}

class SigTraceClient {
  private ws: WebSocket | null = null;
  private queue: TraceEvent[] = [];
  private isConnecting = false;
  private port = 8420;

  constructor() {
    if (typeof __SIGTRACE_PORT__ !== 'undefined') {
      this.port = __SIGTRACE_PORT__;
    }
    if (typeof window !== 'undefined') {
      const match = window.location.search.match(/[?&]sigtracePort=(\d+)/);
      if (match) {
        this.port = parseInt(match[1], 10);
      }
      this.connect();
    }
  }

  private connect() {
    if (this.isConnecting || this.ws) return;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(`ws://localhost:${this.port}`);

      this.ws.onopen = () => {
        this.isConnecting = false;
        console.log(`[SigTrace] Connected to VS Code dev server on port ${this.port}`);
        this.flushQueue();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('[SigTrace] Received message from host:', msg);
        } catch (e) {
          // ignore
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.isConnecting = false;
        // Retry connection after 3 seconds
        setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = () => {
        this.ws = null;
        this.isConnecting = false;
      };
    } catch (e) {
      this.isConnecting = false;
      setTimeout(() => this.connect(), 3000);
    }
  }

  public send(event: TraceEvent) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    } else {
      this.queue.push(event);
    }
  }

  private flushQueue() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.queue.length > 0) {
      const event = this.queue.shift();
      if (event) {
        this.ws.send(JSON.stringify(event));
      }
    }
  }
}

export const client = new SigTraceClient();
export * from './types.js';
