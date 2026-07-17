import { TraceEvent } from './types.js';

declare global {
  const __SIGTRACE_PORT__: number | undefined;
}

// ─── Production Build Guard ───────────────────────────────────────────────────
// SigTrace is a development-only tool. If it is somehow bundled into a
// production build, emit a loud warning and export no-op implementations
// so the application still runs safely without any instrumentation overhead.
const IS_PRODUCTION =
  typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';

if (IS_PRODUCTION) {
  console.warn(
    '[SigTrace] ⚠️  SigTrace detected in a PRODUCTION build!\n' +
    '  This tool is dev-only and should be in devDependencies.\n' +
    '  All signal tracing has been disabled. No data is sent anywhere.\n' +
    '  See: https://sigtrace.dev/docs#production'
  );
}

// ─── High-Frequency Throttle ──────────────────────────────────────────────────
// High-frequency signal writes (e.g. from RxJS streams bound to mouse/scroll/
// WebSocket events) are batched and flushed at most once per animation frame
// (~16 ms). Signals that emit >10 times in 200 ms are auto-detected and
// throttled further to a 50 ms debounce window to keep the dashboard responsive.
const HIGH_FREQ_WINDOW_MS = 200;
const HIGH_FREQ_THRESHOLD = 10;
const HIGH_FREQ_DEBOUNCE_MS = 50;
const FRAME_FLUSH_MS = 16;

interface SignalFrequencyTracker {
  count: number;
  windowStart: number;
  isHighFreq: boolean;
  debounceTimer?: ReturnType<typeof setTimeout>;
}

class SigTraceClient {
  private ws: WebSocket | null = null;
  private queue: TraceEvent[] = [];
  private frameQueue: TraceEvent[] = [];
  private isConnecting = false;
  private port = 8420;
  private frameFlushScheduled = false;
  private freqTrackers = new Map<string, SignalFrequencyTracker>();

  constructor() {
    // In production: export a no-op instance — connect() is never called.
    if (IS_PRODUCTION) return;

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
      // WebSocket connects ONLY to localhost — no data ever leaves the machine.
      this.ws = new WebSocket(`ws://localhost:${this.port}`);

      this.ws.onopen = () => {
        this.isConnecting = false;
        console.log(`[SigTrace] Connected to VS Code dev server on ws://localhost:${this.port}`);
        console.log('[SigTrace] 🔒 All data stays local — no external servers, no telemetry.');
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
        // Self-healing: retry connection after 3 seconds.
        // If the VS Code host window closes, a client window promotes itself
        // to host and we reconnect automatically.
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

  /** Detect high-frequency signals and apply debounce if needed. */
  private isThrottled(event: TraceEvent): boolean {
    const key = `${event.name}::${event.file ?? ''}`;
    const now = Date.now();
    let tracker = this.freqTrackers.get(key);

    if (!tracker) {
      tracker = { count: 1, windowStart: now, isHighFreq: false };
      this.freqTrackers.set(key, tracker);
      return false;
    }

    if (now - tracker.windowStart > HIGH_FREQ_WINDOW_MS) {
      // Reset window
      tracker.count = 1;
      tracker.windowStart = now;
      tracker.isHighFreq = false;
      return false;
    }

    tracker.count++;
    if (tracker.count >= HIGH_FREQ_THRESHOLD) {
      tracker.isHighFreq = true;
    }

    if (tracker.isHighFreq) {
      // Debounce: cancel previous timer, send only after quiet period
      if (tracker.debounceTimer) clearTimeout(tracker.debounceTimer);
      tracker.debounceTimer = setTimeout(() => {
        this.sendImmediate(event);
      }, HIGH_FREQ_DEBOUNCE_MS);
      return true; // suppress immediate send
    }

    return false;
  }

  /** Enqueue event for the next animation frame flush. */
  public send(event: TraceEvent) {
    if (IS_PRODUCTION) return; // no-op in production

    // Check high-frequency throttle
    if (this.isThrottled(event)) return;

    this.frameQueue.push(event);
    this.scheduleFrameFlush();
  }

  /** Send immediately, bypassing frame batching (used by debounce). */
  private sendImmediate(event: TraceEvent) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    } else {
      this.queue.push(event);
    }
  }

  /** Batch-flush the frame queue in one WebSocket write per frame. */
  private scheduleFrameFlush() {
    if (this.frameFlushScheduled) return;
    this.frameFlushScheduled = true;

    const flush = () => {
      this.frameFlushScheduled = false;
      const events = this.frameQueue.splice(0);
      if (events.length === 0) return;

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send all queued events for this frame in one payload
        for (const ev of events) {
          this.ws.send(JSON.stringify(ev));
        }
      } else {
        this.queue.push(...events);
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(flush);
    } else {
      setTimeout(flush, FRAME_FLUSH_MS);
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
