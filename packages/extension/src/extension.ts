import * as vscode from 'vscode';
import { WebSocketServer, WebSocket } from 'ws';
import * as path from 'path';
import * as fs from 'fs';

let wss: WebSocketServer | null = null;
let activeWebviews = new Set<vscode.Webview>();
let cachedSignals = new Map<string, any>();
let eventBuffer: any[] = [];
let visualizerSockets = new Set<WebSocket>();
let isHost = false;
let clientSocket: WebSocket | null = null;

// Store metrics for CodeLens overlays: filePath -> line -> metricObj
const nodeMetrics = new Map<string, Map<number, { id: string, name: string, epoch: number, duration?: number, isHotspot?: boolean }>>();
let codeLensProvider: SigTraceCodeLensProvider | null = null;

function broadcastToVisualizers(message: string) {
  for (const socket of visualizerSockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  }
}

function connectToHost() {
  const ws = new WebSocket('ws://localhost:8420');
  clientSocket = ws;

  ws.on('open', () => {
    console.log('SigTrace: Connected to Host Server on port 8420');
    ws.send(JSON.stringify({ type: 'register-visualizer' }));
  });

  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message.toString());
      
      // Update local cache
      if (payload.type === 'register') {
        cachedSignals.set(payload.id, payload);
      } else if (payload.type === 'write' || payload.type === 'update') {
        const cached = cachedSignals.get(payload.id);
        if (cached) {
          cached.value = payload.value;
          if (payload.duration !== undefined) cached.duration = payload.duration;
        }
        eventBuffer.push(payload);
        if (eventBuffer.length > 200) {
          eventBuffer.shift();
        }
      }

      // Forward to local webviews
      for (const webview of activeWebviews) {
        webview.postMessage(payload);
      }
    } catch (e) {
      console.error('Error forwarding message from Host:', e);
    }
  });

  ws.on('close', () => {
    console.log('SigTrace: Host Server disconnected. Retrying startServer in 3s...');
    clientSocket = null;
    setTimeout(startServer, 3000);
  });

  ws.on('error', () => {
    // Ignore, close event will trigger retry
  });
}

function startServer() {
  const port = 8420;
  isHost = false;
  
  const tempWss = new WebSocketServer({ port });
  
  tempWss.on('listening', () => {
    wss = tempWss;
    isHost = true;
    console.log(`SigTrace: WS Server running as Host on port ${port}`);
    
    wss.on('connection', (ws) => {
      let isVisualizer = false;
      
      ws.on('message', (message) => {
        try {
          const rawStr = message.toString();
          const payload = JSON.parse(rawStr);
          
          if (payload.type === 'register-visualizer') {
            isVisualizer = true;
            visualizerSockets.add(ws);
            console.log('SigTrace: Sub-window visualizer connected');
            // Send current cache to sub-window
            for (const node of cachedSignals.values()) {
              ws.send(JSON.stringify(node));
            }
            for (const event of eventBuffer) {
              ws.send(JSON.stringify(event));
            }
            return;
          }
          
          // Browser message processing
          if (payload.type === 'register') {
            cachedSignals.set(payload.id, payload);
          } else if (payload.type === 'write' || payload.type === 'update') {
            const cached = cachedSignals.get(payload.id);
            if (cached) {
              cached.value = payload.value;
              if (payload.duration !== undefined) cached.duration = payload.duration;
            }
            eventBuffer.push(payload);
            if (eventBuffer.length > 200) {
              eventBuffer.shift();
            }
          }
          
          // Capture metrics for editor CodeLens
          if (payload.type === 'register' && payload.loc) {
            const resolvedPath = getLocalFsPath(payload.loc.file);
            if (resolvedPath) {
              if (!nodeMetrics.has(resolvedPath)) {
                nodeMetrics.set(resolvedPath, new Map());
              }
              nodeMetrics.get(resolvedPath)!.set(payload.loc.line, {
                id: payload.id,
                name: payload.name,
                epoch: 0,
                duration: 0
              });
              if (codeLensProvider) codeLensProvider.refresh();
            }
          } else if ((payload.type === 'write' || payload.type === 'update') && payload.id) {
            // Find metric by ID to update it
            for (const [filePath, lineMap] of nodeMetrics.entries()) {
              for (const [line, metric] of lineMap.entries()) {
                if (metric.id === payload.id) {
                  metric.epoch++;
                  if (payload.duration !== undefined) {
                    metric.duration = payload.duration;
                    if (payload.duration > 2.0) {
                      metric.isHotspot = true;
                    }
                  }
                  if (codeLensProvider) codeLensProvider.refresh();
                  break;
                }
              }
            }
          }
          
          // Forward event to all active webviews in this window
          for (const webview of activeWebviews) {
            webview.postMessage(payload);
          }
          
          // Broadcast to other windows
          broadcastToVisualizers(rawStr);
          
        } catch (e) {
          console.error('Error handling WS message:', e);
        }
      });
      
      ws.on('close', () => {
        if (isVisualizer) {
          visualizerSockets.delete(ws);
          console.log('SigTrace: Sub-window visualizer disconnected');
        }
      });
    });
  });

  tempWss.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log('SigTrace: Port 8420 in use, connecting as client to Host...');
      tempWss.close();
      connectToHost();
    } else {
      console.error('SigTrace: Server error:', err);
    }
  });
}

function getLocalFsPath(filePath: string): string | null {
  let p = filePath;
  if (p.startsWith('http://') || p.startsWith('https://')) {
    try {
      const url = new URL(p);
      p = url.pathname;
    } catch (e) {
      return null;
    }
  }

  if (fs.existsSync(p)) {
    return fs.realpathSync(p);
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const fullPath = path.join(
        folder.uri.fsPath,
        p.startsWith('/') ? p.slice(1) : p
      );
      if (fs.existsSync(fullPath)) {
        return fs.realpathSync(fullPath);
      }
    }
  }
  return null;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('SigTrace Extension is now active!');

  startServer();

  // Register Webview Provider
  const provider = new SigTraceViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SigTraceViewProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  // Register CodeLens Provider
  codeLensProvider = new SigTraceCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'javascriptreact' }
      ],
      codeLensProvider
    )
  );

  // Register command to focus node in Webview
  context.subscriptions.push(
    vscode.commands.registerCommand('sigtrace.focusNode', (nodeId: string) => {
      for (const webview of activeWebviews) {
        webview.postMessage({
          type: 'focus-node',
          id: nodeId
        });
      }
    })
  );
}

export function deactivate() {
  if (wss) {
    wss.close();
    wss = null;
  }
  if (clientSocket) {
    clientSocket.close();
    clientSocket = null;
  }
  activeWebviews.clear();
  nodeMetrics.clear();
  cachedSignals.clear();
  eventBuffer = [];
  visualizerSockets.clear();
}

class SigTraceCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  public refresh() {
    this._onDidChangeCodeLenses.fire();
  }

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();
    
    // Scan document for creators
    const regex = /\b(signal|computed|ref|createSignal|createMemo|createEffect|watchEffect)\s*\(/g;
    let match;
    const docPath = fs.existsSync(document.uri.fsPath) 
      ? fs.realpathSync(document.uri.fsPath) 
      : document.uri.fsPath;

    while ((match = regex.exec(text)) !== null) {
      const position = document.positionAt(match.index);
      const line = position.line + 1; // 1-indexed

      const fileMetrics = nodeMetrics.get(docPath);
      const lineMetrics = fileMetrics?.get(line);

      if (lineMetrics) {
        const range = new vscode.Range(position.line, 0, position.line, 0);
        let title = `SigTrace: ${lineMetrics.epoch} updates`;
        if (lineMetrics.duration !== undefined && lineMetrics.duration > 0) {
          title += ` | ${lineMetrics.duration.toFixed(2)}ms`;
        }
        if (lineMetrics.isHotspot) {
          title += ` 🚨 HOTSPOT`;
        }

        codeLenses.push(new vscode.CodeLens(range, {
          title,
          command: 'sigtrace.focusNode',
          arguments: [lineMetrics.id]
        }));
      }
    }

    return codeLenses;
  }
}

class SigTraceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'sigtrace-explorer';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    activeWebviews.add(webviewView.webview);

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case 'ready': {
          for (const node of cachedSignals.values()) {
            webviewView.webview.postMessage(node);
          }
          for (const event of eventBuffer) {
            webviewView.webview.postMessage(event);
          }
          break;
        }
        case 'openFile': {
          let filePath = data.file;
          
          if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
            try {
              const url = new URL(filePath);
              filePath = url.pathname;
            } catch (e) {
              // ignore
            }
          }

          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders) {
            let resolvedPath = filePath;
            
            for (const folder of workspaceFolders) {
              const fullPath = path.join(
                folder.uri.fsPath,
                filePath.startsWith('/') ? filePath.slice(1) : filePath
              );
              if (fs.existsSync(fullPath)) {
                resolvedPath = fullPath;
                break;
              }
              if (fs.existsSync(filePath)) {
                resolvedPath = filePath;
                break;
              }
            }

            if (fs.existsSync(resolvedPath)) {
              const doc = await vscode.workspace.openTextDocument(resolvedPath);
              await vscode.window.showTextDocument(doc, {
                selection: new vscode.Range(
                  data.line - 1,
                  data.column || 0,
                  data.line - 1,
                  data.column || 0
                )
              });
            } else {
              vscode.window.showErrorMessage(
                `SigTrace: Could not resolve local file path for: ${filePath}`
              );
            }
          }
          break;
        }
        case 'clearMetrics': {
          nodeMetrics.clear();
          cachedSignals.clear();
          eventBuffer = [];
          if (codeLensProvider) codeLensProvider.refresh();
          break;
        }
      }
    });

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.onDidDispose(() => {
      activeWebviews.delete(webviewView.webview);
      this._view = undefined;
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(
      this._extensionUri,
      'src',
      'webview',
      'index.html'
    );
    const appJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'app.js')
    );
    const d3JsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'd3.min.js')
    );

    let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
    htmlContent = htmlContent.replace('d3.min.js', d3JsUri.toString());
    htmlContent = htmlContent.replace('app.js', appJsUri.toString());

    return htmlContent;
  }
}
