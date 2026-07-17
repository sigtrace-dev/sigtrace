<div align="center">

<!-- Logo placeholder – replace with actual logo when available -->
<img src="https://via.placeholder.com/120x120/6C63FF/ffffff?text=ST" alt="SigTrace Logo" width="120" />

<h1>SigTrace</h1>

<p><strong>The missing debugger for reactive signals.</strong></p>

<p>
  <a href="https://www.npmjs.com/package/@sigtrace/core"><img src="https://img.shields.io/npm/v/@sigtrace/core?color=6C63FF&style=flat-square&label=npm%20%40sigtrace%2Fcore" alt="npm version" /></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=sigtrace.sigtrace-extension"><img src="https://img.shields.io/visual-studio-marketplace/d/sigtrace.sigtrace-extension?color=007ACC&style=flat-square&label=VS%20Code%20installs" alt="VS Code installs" /></a>
  <a href="https://github.com/sigtrace-dev/sigtrace/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="License MIT" /></a>
  <a href="https://github.com/sigtrace-dev/sigtrace/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/sigtrace-dev/sigtrace/ci.yml?branch=main&style=flat-square&label=CI&color=6C63FF" alt="CI status" /></a>
  <a href="https://buymeacoffee.com/sigtrace"><img src="https://img.shields.io/badge/Sponsor-%E2%98%95-FFDD00?style=flat-square&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee" /></a>
</p>

<p>
  Visualize, trace, and debug your reactive signal graphs in real time —<br/>
  directly inside VS Code, with zero refactoring required.
</p>

</div>

---

## 📸 Screenshots

> **DevTools Panel** — Activity Table · Timeline · Component Cards · D3 Force Graph

<!-- Replace with actual screenshots once CI generates them -->
```
┌─────────────────────────────────────────────────────────────────────┐
│  SigTrace DevTools                              [Graph] [Dashboard] │
│─────────────────────────────────────────────────────────────────────│
│  ACTIVITY TABLE                              🔍 Filter by signal... │
│  ──────────────────────────────────────────────────────────────────  │
│  signal      event    value          file                  time      │
│  count       write    42 → 43        counter.component.ts  12:01:44  │
│  doubleCount computed 84 → 86        counter.component.ts  12:01:44  │
│  cartTotal   computed $142.50        cart.service.ts       12:01:44  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📊 **Activity Table** | Live, filterable event log for every signal read, write, and effect. Search by name, file, or value. |
| ⏱️ **Timeline (Causal Chains)** | Swimlane visualization showing which writes triggered which reads. Critical paths highlighted. |
| 🧩 **Component Cards** | Per-component signal snapshot — current values, last-updated timestamps, click to filter. |
| 🎯 **Click-to-Navigate** | Click any signal event or graph node to jump to the exact source line in your editor. |
| 🪟 **Multi-window Sync** | Multiple VS Code windows can connect to the same SigTrace server simultaneously. |
| ⚡ **Zero-refactoring Setup** | Build-time AST instrumentation — no `import { trace }` required. Your code stays clean. |

---

## 🧩 Supported Frameworks

| Framework | Version | Status |
|-----------|---------|--------|
| **Angular** | 17+ (Signals API) | ✅ Fully supported |
| **Vue** | 3+ (Composition API) | 🔜 Coming in v1.2 |
| **SolidJS** | 1.8+ | 🔜 Coming in v1.2 |

---

## 🚀 Quick Start

### Angular

**1. Install packages:**
```bash
npm install --save-dev @sigtrace/core @sigtrace/vite-plugin
```

**2. Add the Vite plugin** (`vite.config.ts`):
```typescript
import { defineConfig } from 'vite';
import { angular } from '@analogjs/vite-plugin-angular';
import { sigtracePlugin } from '@sigtrace/vite-plugin';

export default defineConfig({
  plugins: [
    angular(),
    sigtracePlugin(), // ← add this
  ],
});
```

**3. Open the DevTools panel in VS Code:**

```
Cmd+Shift+P → "SigTrace: Open DevTools Panel"
```

**4. Run your app and watch the signal graph come alive:**
```bash
npm run start
```

---

### Vue 3

> ⏳ Vue 3 adapter is in active development. Star the repo to be notified when it ships!

```bash
# Coming in v1.2.0 — track progress:
# https://github.com/sigtrace-dev/sigtrace/issues?q=label%3Avue3
```

---

### SolidJS

> ⏳ SolidJS adapter is in active development.

```bash
# Coming in v1.2.0 — track progress:
# https://github.com/sigtrace-dev/sigtrace/issues?q=label%3Asolidjs
```

---

## 🏗️ Architecture

SigTrace is a monorepo with three focused packages:

```
sigtrace/
├── packages/
│   ├── core/           @sigtrace/core         — WebSocket server + event types
│   ├── vite-plugin/    @sigtrace/vite-plugin   — Build-time AST instrumentation
│   └── extension/      sigtrace-devtools       — VS Code DevTools panel
└── demo/               Reference Angular app
```

| Package | npm | Purpose |
|---------|-----|---------|
| `packages/core` | [`@sigtrace/core`](https://www.npmjs.com/package/@sigtrace/core) | Lightweight WebSocket server (`localhost:7337`) that receives signal lifecycle events and streams them to connected clients |
| `packages/vite-plugin` | [`@sigtrace/vite-plugin`](https://www.npmjs.com/package/@sigtrace/vite-plugin) | Vite transform that instruments `signal()`, `computed()`, `effect()`, and `toSignal()` calls at build time via AST rewriting |
| `packages/extension` | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sigtrace.sigtrace-devtools) | VS Code extension hosting the DevTools webview panel — graph, dashboard, CodeLens overlays, and source navigation |

---

## ⚙️ How It Works

```
Your App Source                 Vite Build Pipeline              SigTrace Server
─────────────────               ────────────────────             ───────────────
const count =                   @sigtrace/vite-plugin            @sigtrace/core
  signal(0);          ───AST──▶  instruments calls    ──WS──▶   WebSocket server
                                 at build time                    :7337
                                        │
                                        ▼                              │
                              Instrumented Runtime                      │
                              emits events on every               VS Code Extension
                              signal read/write/effect  ◀──WS────  connects &
                                                                   renders DevTools
```

1. **Build time**: `@sigtrace/vite-plugin` rewrites your source using an AST transform. It wraps signal primitives with thin event emitters that record the signal name, source location, value, and timestamp.

2. **Runtime**: The instrumented app connects to the `@sigtrace/core` WebSocket server and streams events as JSON messages.

3. **DevTools**: The VS Code extension connects to the same WebSocket endpoint, receives events, and renders the interactive dashboard and graph in a Webview panel.

> **Production safety**: The instrumentation is only injected in development mode. Your production bundles are completely unaffected.

---

## 📦 Installation Reference

| What you need | Install command |
|---------------|-----------------|
| WebSocket server + types | `npm i -D @sigtrace/core` |
| Vite build plugin | `npm i -D @sigtrace/vite-plugin` |
| VS Code extension | Search **"SigTrace DevTools"** in VS Code extensions |

---

## 🔧 Configuration

`@sigtrace/vite-plugin` accepts an optional configuration object:

```typescript
sigtracePlugin({
  port: 7337,          // WebSocket server port (default: 7337)
  enabled: true,       // Enable/disable instrumentation (default: true in dev)
  verbose: false,      // Log instrumentation activity to console (default: false)
  include: ['**/*.ts'],// Glob patterns to instrument (default: all .ts files)
  exclude: ['**/node_modules/**'],
})
```

---

## 🤝 Contributing

We welcome contributions! Whether it's a bug fix, a new framework adapter, or a UI improvement — all contributions are valuable.

Please read our [**Contributing Guide**](./CONTRIBUTING.md) to get started, and review our [**Code of Conduct**](./CODE_OF_CONDUCT.md).

**Quick links:**
- 🐛 [Report a bug](https://github.com/sigtrace-dev/sigtrace/issues/new?template=bug_report.yml)
- 💡 [Request a feature](https://github.com/sigtrace-dev/sigtrace/issues/new?template=feature_request.yml)
- 💬 [Join our Discord](https://discord.gg/DH9YHmbkB)

---

## 🔒 Security

To report a security vulnerability, please open a **[GitHub Private Security Report](https://github.com/sigtrace-dev/sigtrace/security/advisories/new)** rather than opening a public issue.

See our full [**Security Policy**](./SECURITY.md) for disclosure timelines and supported versions.

---

## 📝 Changelog

See [**CHANGELOG.md**](./CHANGELOG.md) for a detailed history of changes across all versions.

---

## 📄 License

SigTrace is open-source software released under the [**MIT License**](./LICENSE).

Copyright © 2025 SigTrace Contributors.

---

<div align="center">

Made with ❤️ by the SigTrace community

[sigtrace.dev](https://sigtrace.dev) · [Discord](https://discord.gg/sigtrace) · [npm](https://www.npmjs.com/org/sigtrace) · [VS Code Marketplace](https://marketplace.visualstudio.com/publishers/sigtrace)

</div>
