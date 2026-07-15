"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.client = void 0;
class SigTraceClient {
    ws = null;
    queue = [];
    isConnecting = false;
    port = 8420;
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
    connect() {
        if (this.isConnecting || this.ws)
            return;
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
                }
                catch (e) {
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
        }
        catch (e) {
            this.isConnecting = false;
            setTimeout(() => this.connect(), 3000);
        }
    }
    send(event) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(event));
        }
        else {
            this.queue.push(event);
        }
    }
    flushQueue() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        while (this.queue.length > 0) {
            const event = this.queue.shift();
            if (event) {
                this.ws.send(JSON.stringify(event));
            }
        }
    }
}
exports.client = new SigTraceClient();
__exportStar(require("./types.js"), exports);
//# sourceMappingURL=index.js.map