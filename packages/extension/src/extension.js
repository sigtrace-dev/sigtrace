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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ws_1 = require("ws");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let wss = null;
let activeWebviews = new Set();
function activate(context) {
    console.log('SigTrace Extension is now active!');
    // Start WebSocket Server
    const port = 8420;
    try {
        wss = new ws_1.WebSocketServer({ port });
        console.log(`SigTrace WS Server running on port ${port}`);
        wss.on('connection', (ws) => {
            console.log('SigTrace: Client connected (browser dev bundle)');
            ws.on('message', (message) => {
                try {
                    const payload = JSON.parse(message.toString());
                    // Forward event to all active webviews
                    for (const webview of activeWebviews) {
                        webview.postMessage(payload);
                    }
                }
                catch (e) {
                    console.error('Error forwarding message from WS client:', e);
                }
            });
            ws.on('close', () => {
                console.log('SigTrace: Client disconnected');
            });
        });
        wss.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                vscode.window.showWarningMessage(`SigTrace: Port ${port} is already in use. Please check if another instance of SigTrace is running.`);
            }
            else {
                console.error('WS Server Error:', err);
            }
        });
    }
    catch (err) {
        console.error('Failed to launch WS Server:', err);
    }
    // Register Webview Provider
    const provider = new SigTraceViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(SigTraceViewProvider.viewType, provider));
}
function deactivate() {
    if (wss) {
        wss.close();
        wss = null;
    }
    activeWebviews.clear();
}
class SigTraceViewProvider {
    _extensionUri;
    static viewType = 'sigtrace-explorer';
    _view;
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        activeWebviews.add(webviewView.webview);
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case 'openFile': {
                    let filePath = data.file;
                    // Handle localhost URL conversion to local file path
                    // If the path is of format "http://localhost:5173/src/App.tsx",
                    // we convert it to the relative file "/src/App.tsx" under workspace roots.
                    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                        try {
                            const url = new URL(filePath);
                            filePath = url.pathname; // returns "/src/App.tsx"
                        }
                        catch (e) {
                            // ignore
                        }
                    }
                    // Search workspace folders for the file
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders) {
                        let resolvedPath = filePath;
                        // Try matching as relative path to workspace root
                        for (const folder of workspaceFolders) {
                            const fullPath = path.join(folder.uri.fsPath, filePath.startsWith('/') ? filePath.slice(1) : filePath);
                            if (fs.existsSync(fullPath)) {
                                resolvedPath = fullPath;
                                break;
                            }
                            // Also try absolute match
                            if (fs.existsSync(filePath)) {
                                resolvedPath = filePath;
                                break;
                            }
                        }
                        if (fs.existsSync(resolvedPath)) {
                            const doc = await vscode.workspace.openTextDocument(resolvedPath);
                            await vscode.window.showTextDocument(doc, {
                                selection: new vscode.Range(data.line - 1, data.column || 0, data.line - 1, data.column || 0)
                            });
                        }
                        else {
                            vscode.window.showErrorMessage(`SigTrace: Could not resolve local file path for: ${filePath}`);
                        }
                    }
                    break;
                }
            }
        });
        webviewView.onDidDispose(() => {
            activeWebviews.delete(webviewView.webview);
            this._view = undefined;
        });
    }
    _getHtmlForWebview(webview) {
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'index.html');
        const appJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'app.js'));
        let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
        // Replace app.js link with the Webview relative URI
        htmlContent = htmlContent.replace('app.js', appJsUri.toString());
        return htmlContent;
    }
}
//# sourceMappingURL=extension.js.map