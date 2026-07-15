# SigTrace Reactivity Visualizer

SigTrace is a real-time reactive graph visualizer and telemetry overlay built directly inside VS Code. It automatically maps how state flows from writable signals, through computed derivations, to observer effects and HTML templates.

---

## Key Features

### 1. Visualizer Sidebar
- **Component Clustering**: Automatically groups signals, computed memos, and effects inside visual container cards corresponding to their parent components (e.g. `FilterPanel`, `SearchResultsComponent`).
- **Focus Path Isolation**: Click a node to immediately dim the rest of the graph to 10% opacity, highlighting only that node's direct upstream producers and downstream subscribers.
- **Timeline Playback Player**: Step backward and forward through a chronological history of reactivity ticks, watching the graph update and flash step-by-step.
- **Search Filtering**: Filter out nodes and component containers using the text search bar.

### 2. VS Code CodeLens Telemetry Overlay
- Floating inline telemetry is injected directly above signal/computed/effect declarations inside your editor code files:
  `SigTrace: 48 updates | 8.52ms avg | 🚨 HOTSPOT`
- Zero context-switching: Click the CodeLens to automatically focus the node in the visualizer.

### 3. Diagnostics Warnings Tab & Loop Safeguard
- **Circular Invalidation Loop**: Automatically detects high-frequency recursive loops (evaluates > 25 times/sec) and pauses execution before the browser tab freezes.
- **Computation Hotspot Alerts**: Flags computed memos taking > 2.0ms to re-evaluate.
- **Dead Signals**: Flags signals that are registered but never read by any computed, effect, or template.

---

## Extension Settings

This extension contributes the following settings:

* `sigtrace.port`: Specifies the local WebSocket server port (defaults to `8420`).

---

## Getting Started

1. Open your project in VS Code.
2. Click on the **SigTrace Eye Icon** in the Activity Bar to open the visualizer.
3. Install the NPM library in your dev server:
   ```bash
   yarn add @sigtrace/core --dev
   ```
4. Start your dev server prefixed with our CLI wrapper:
   ```bash
   npx sigtrace run ng serve
   ```
5. Open your browser and interact with your app; watch the visualizer map your reactivity live!

---

## License

[MIT](LICENSE)
