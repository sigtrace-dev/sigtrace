#!/usr/bin/env node
'use strict';

// Implements `npx sigtrace web`: a standalone browser dashboard for
// SigTrace that needs no IDE at all. It serves the same webview UI used by
// the VS Code/JetBrains panels on a free local port, and it speaks the same
// tracing WebSocket protocol those panels use — including the same
// host-or-attach fallback, so this works whether or not an IDE session is
// already tracing on port 8420.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

let WebSocket, WebSocketServer;
try {
  ({ WebSocket, WebSocketServer } = require('ws'));
} catch (e) {
  console.error(
    '[SigTrace] The "web" command requires the "ws" package, which ships as a ' +
    'dependency of @sigtrace/core. If you see this, try reinstalling ' +
    'node_modules for this project.'
  );
  process.exit(1);
}

const WEBVIEW_DIR = path.resolve(__dirname, '../webview');
const TRACE_PORT = 8420;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8'
};

// ── Tracing socket: host if free, attach as a visualizer if not ───────────
// This mirrors startServer()/connectToHost() in the VS Code extension and
// SigTraceWebSocketServer.kt in the JetBrains plugin, so the exact same
// instrumented app and the exact same protocol work identically here.
let wss = null;
let clientSocket = null;
const cachedSignals = new Map();
let eventBuffer = [];
const visualizerSockets = new Set();

function broadcastToVisualizers(raw) {
  for (const socket of visualizerSockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(raw);
  }
}

function cacheEvent(payload) {
  if (payload.type === 'register') {
    cachedSignals.set(payload.id, payload);
  } else if (payload.type === 'write' || payload.type === 'update') {
    const cached = cachedSignals.get(payload.id);
    if (cached) cached.value = payload.value;
    eventBuffer.push(payload);
    if (eventBuffer.length > 200) eventBuffer.shift();
  }
}

function connectAsClient() {
  const ws = new WebSocket(`ws://localhost:${TRACE_PORT}`);
  clientSocket = ws;

  ws.on('open', () => {
    console.log(`[SigTrace] Attached to an existing tracing session on port ${TRACE_PORT}.`);
    ws.send(JSON.stringify({ type: 'register-visualizer' }));
  });

  ws.on('message', (raw) => {
    try {
      cacheEvent(JSON.parse(raw.toString()));
    } catch (e) {
      return;
    }
    broadcastToVisualizers(raw.toString());
  });

  ws.on('close', () => {
    clientSocket = null;
    setTimeout(startTraceHost, 3000);
  });

  ws.on('error', () => {
    // The 'close' handler above will retry.
  });
}

function startTraceHost() {
  const server = new WebSocketServer({ port: TRACE_PORT });

  server.on('listening', () => {
    wss = server;
    console.log(`[SigTrace] Tracing server listening on ws://localhost:${TRACE_PORT}`);
  });

  server.on('connection', (ws) => {
    let isVisualizer = false;

    ws.on('message', (raw) => {
      let payload;
      try {
        payload = JSON.parse(raw.toString());
      } catch (e) {
        return;
      }

      if (payload.type === 'register-visualizer') {
        isVisualizer = true;
        visualizerSockets.add(ws);
        for (const node of cachedSignals.values()) ws.send(JSON.stringify(node));
        for (const event of eventBuffer) ws.send(JSON.stringify(event));
        return;
      }

      cacheEvent(payload);
      broadcastToVisualizers(raw.toString());
    });

    ws.on('close', () => {
      if (isVisualizer) visualizerSockets.delete(ws);
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(
        `[SigTrace] Port ${TRACE_PORT} is already in use by another SigTrace ` +
        'session (likely a VS Code or JetBrains window) — attaching to it ' +
        'instead of starting a new one.'
      );
      server.close();
      connectAsClient();
    } else {
      console.error('[SigTrace] Tracing server error:', err);
    }
  });
}

// ── Static dashboard (the browser page itself) ─────────────────────────────
function openInEditor(filePath, line) {
  if (!filePath) return;

  let resolved = filePath;
  if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
    try {
      resolved = new URL(resolved).pathname;
    } catch (e) {
      // keep original string
    }
  }
  if (!fs.existsSync(resolved)) {
    resolved = path.resolve(process.cwd(), resolved.replace(/^\//, ''));
  }
  if (!fs.existsSync(resolved)) {
    console.log(`[SigTrace] Could not resolve file to open: ${filePath}`);
    return;
  }

  // Best-effort only: shells out to the `code` CLI if it's on PATH. In
  // standalone "web" mode there is no guaranteed IDE to hand off to, so a
  // missing `code` command is expected in some setups, not an error.
  const target = line ? `${resolved}:${line}` : resolved;
  const child = spawn('code', ['-g', target], { stdio: 'ignore', shell: true });
  child.on('error', () => {
    console.log(`[SigTrace] ${target}  (install VS Code's "code" command in PATH to jump to it automatically)`);
  });
}

function serveStatic(req, res) {
  if (req.method === 'POST' && req.url === '/open-file') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const { file, line } = JSON.parse(body || '{}');
        openInEditor(file, line);
      } catch (e) {
        // ignore malformed body
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  const urlPath = (req.url === '/' ? '/index.html' : req.url).split('?')[0];
  const requestedPath = path.normalize(path.join(WEBVIEW_DIR, urlPath));

  if (requestedPath !== WEBVIEW_DIR && !requestedPath.startsWith(WEBVIEW_DIR + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(requestedPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(requestedPath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function openInBrowser(url) {
  const platform = os.platform();
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', shell: true, detached: true }).unref();
  } catch (e) {
    // Not fatal — the URL is already printed to the console below.
  }
}

function startWebDashboard() {
  startTraceHost();

  const httpServer = http.createServer(serveStatic);

  // Port 0 = ask the OS for any free port, per the "any available port" ask.
  httpServer.listen(0, () => {
    const { port } = httpServer.address();
    const url = `http://localhost:${port}`;
    console.log(`\n[SigTrace] Dashboard running at ${url}`);
    console.log('[SigTrace] Press Ctrl+C to stop.\n');
    openInBrowser(url);
  });

  const shutdown = () => {
    httpServer.close();
    if (wss) wss.close();
    if (clientSocket) clientSocket.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { startWebDashboard };
