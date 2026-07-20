# Changelog

All notable changes to SigTrace will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Vue 3 signals (`ref`, `computed`, `watchEffect`) adapter
- SolidJS 1.8+ `createSignal` / `createMemo` adapter
- Performance timeline integration with browser DevTools
- npm `sigtrace` CLI for zero-config setup

---

## [1.1.6] – 2026-07-21

### Changed
- Bumped monorepo and package manifests to `1.1.6` for deployment consistency.
- Updated website release/version references to `1.1.6`.

---

## [1.1.4] – 2026-07-21

### Changed
- Website copy, SEO metadata, and setup guidance were refined for clearer user value and broader framework/editor discoverability.
- Extension and JetBrains webview UX were enhanced with value inspection, pinning, timeline filtering controls, and softer diagnostics wording.

---

## [1.1.3] – 2025-07-10

### Added
- **`toSignal` CallExpression AST instrumentation**: The Vite plugin's transform now detects `toSignal(...)` call expressions in Angular source files and injects signal lifecycle metadata at the call site. This enables precise source-location attribution for RxJS-interop signals in the DevTools dashboard.
- Metadata injection includes: originating file path, line number, column offset, and the inferred observable name (extracted from the call argument when statically analyzable).

### Changed
- AST traversal in `transform.ts` is now depth-first with early-exit optimization for non-Angular files, reducing instrumentation overhead on large monorepos.

### Fixed
- Metadata was not injected when `toSignal` was used inside a class constructor initializer; this is now handled correctly.

---

## [1.1.2] – 2025-06-28

### Added
- **`register.cjs` RxJS-interop import rewriting**: A new CommonJS-compatible pre-loader (`register.cjs`) rewrites `@angular/core/rxjs-interop` bare specifiers to their deep-import equivalents at module resolution time. This ensures compatibility with Jest and other CommonJS test runners that cannot process Angular's ESM-only exports map.

### Fixed
- `toSignal` instrumentation failed silently when `@angular/core/rxjs-interop` was resolved via the CJS build. The `register.cjs` pre-loader resolves this by normalizing the import path before the module loader processes it.
- Resolved a race condition where the WebSocket server would emit `signal:read` events before the client handshake was fully established, causing the first batch of events to be dropped.

---

## [1.1.1] – 2025-06-15

### Added
- **`toSignal` RxJS-interop adapter**: SigTrace now instruments Angular's `toSignal()` function from `@angular/core/rxjs-interop`. Signals created via `toSignal(observable$)` are automatically tracked in the reactive graph with their own node type (`rxjs-interop`), distinct from `signal()` and `computed()` nodes.
- The Timeline view in the DevTools dashboard now renders `rxjs-interop` nodes with a distinct visual badge and color coding.

### Changed
- The `@sigtrace/core` WebSocket event schema was extended with an optional `adapter` field on `SignalEvent` to identify the signal creation mechanism (`signal`, `computed`, `effect`, `rxjs-interop`).

---

## [1.1.0] – 2025-05-20

### Added
- **New Dashboard UI** – The DevTools panel was completely redesigned with three primary views:
  - **Activity Table**: A live, filterable, sortable event log showing every signal read, write, and effect execution in real time. Supports fuzzy search by signal name, file, or value.
  - **Timeline (Causal Chains)**: A Gantt-style swimlane visualization that shows causal chains between signal events — which write triggered which reads, and which effects were scheduled. Critical paths are highlighted.
  - **Component Cards**: A grid of Angular component instances, each showing their owned signals, current values, and last-updated timestamps. Clicking a card filters the Activity Table to that component.
- **Click-to-navigate source code**: Clicking any signal event in the Activity Table or a node in the graph opens the originating source file in VS Code at the exact line of the signal declaration or call site.
- **Full JSON value viewer**: Signal values (including deeply nested objects and arrays) can be inspected in a collapsible, syntax-highlighted JSON tree. Supports diff view between previous and current value.
- **Multi-window Extension Host clustering**: The extension now supports multiple VS Code windows connected to the same SigTrace WebSocket server simultaneously. Events are broadcast to all connected panels, enabling split-screen debugging workflows.

### Changed
- The D3 force graph is now accessible as a dedicated **Graph** tab within the dashboard, rather than being the default view.
- WebSocket message framing was optimized: events are now batched into micro-task frames (16ms window) before transmission, reducing CPU usage in high-frequency signal graphs by up to 40%.
- The extension's Webview now uses a Content Security Policy (CSP) that restricts `script-src` to `'nonce-{nonce}'` only.

### Fixed
- CodeLens overlays now correctly debounce on rapid consecutive writes to the same signal, preventing UI jitter.
- The extension panel no longer crashes when the WebSocket server restarts while the panel is open.
- Fixed a memory leak in the graph renderer where D3 nodes accumulated without cleanup on page reloads.

---

## [1.0.8] – 2025-03-12

### Added
- **CodeLens overlays**: Inline CodeLens annotations appear above `signal()`, `computed()`, and `effect()` declarations in the editor, showing the current signal value and the number of reads since the last write. CodeLens items are clickable and navigate to the corresponding event in the DevTools panel.

### Fixed
- Resolved an issue where the WebSocket server crashed on malformed JSON payloads. The server now validates all incoming messages against the `SignalEvent` schema and discards invalid frames with a warning log.
- Fixed a TypeScript compilation error in `packages/extension/src/CodeLensProvider.ts` when targeting `moduleResolution: bundler`.
- Extension activation was delayed on large workspaces due to synchronous directory scanning on startup. This has been refactored to be fully asynchronous.
- Corrected the `contributes.commands` registration in `extension/package.json` so that the **SigTrace: Clear Events** command appears in the Command Palette without requiring an active panel.

### Changed
- Improved error messaging when the extension cannot connect to the WebSocket server — the status bar item now shows a pulsing amber indicator and a tooltip explaining how to start the server.

---

## [1.0.0] – 2025-01-15

### Added
- **Initial release of SigTrace** 🎉
- **D3 force-directed graph visualizer**: Real-time reactive graph rendered as an interactive force-directed graph using D3.js. Nodes represent signals, computed values, and effects; edges represent reactive dependencies. Supports drag, zoom, and pan.
- **Angular 17+ signals support**: Full instrumentation of Angular's `signal()`, `computed()`, and `effect()` primitives via build-time AST transformation.
- **WebSocket server** (`@sigtrace/core`): A lightweight WebSocket server that receives signal lifecycle events from the instrumented application and streams them to connected DevTools clients. Runs on `localhost:7337` by default.
- **`@sigtrace/vite-plugin`**: Vite plugin that hooks into the transform pipeline to inject SigTrace instrumentation into Angular source files. Zero-config for standard Angular + Vite projects.
- **VS Code extension** (`sigtrace-devtools`): Extension that hosts the DevTools panel as a Webview, manages the WebSocket connection, and provides the initial graph visualization.
- **Monorepo setup** with npm workspaces covering `packages/core`, `packages/vite-plugin`, and `packages/extension`.
- Reference demo application in `demo/` — an Angular app showcasing signal-heavy UI patterns (counter, derived state, async effects).

---

[Unreleased]: https://github.com/sigtrace-dev/sigtrace/compare/v1.1.6...HEAD
[1.1.6]: https://github.com/sigtrace-dev/sigtrace/compare/v1.1.4...v1.1.6
[1.1.4]: https://github.com/sigtrace-dev/sigtrace/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/sigtrace-dev/sigtrace/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/sigtrace-dev/sigtrace/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/sigtrace-dev/sigtrace/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/sigtrace-dev/sigtrace/compare/v1.0.8...v1.1.0
[1.0.8]: https://github.com/sigtrace-dev/sigtrace/compare/v1.0.0...v1.0.8
[1.0.0]: https://github.com/sigtrace-dev/sigtrace/releases/tag/v1.0.0
