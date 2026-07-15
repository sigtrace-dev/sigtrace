Product Requirement Document (PRD): SigTrace
Document Version: 1.0.0

Target Domain: sigtrace.dev

Product Class: Developer Tooling (Vite Compiler Plugin & VS Code/Cursor IDE Extension)

Primary Focus: Cross-Framework Signal-Driven Reactivity Visualization and Debugging

1. Executive Summary & Value Proposition
1.1 Problem Statement
The frontend ecosystem is experiencing a shift away from traditional Virtual DOM reconciliation toward fine-grained reactive signals (Svelte 5 Runes, SolidJS, Vue Vapor, Angular Signals). However, debugging reactive dependency graphs is a major point of friction for developers.  

Reactivity updates happen synchronously, silently, and often under intense compiler obfuscation. Traditional browser DevTools are siloed within single frameworks, run entirely in isolation from the editor, and require developers to switch back and forth between browser panels and their IDE. When a reactive update fails to trigger, or loops infinitely, developers are left guessing which dependency path is broken.

1.2 Value Proposition
SigTrace is an open-source, universal diagnostic tool that maps, profiles, and debugs reactive signal graphs directly inside VS Code and Cursor. By combining a build-time compiler plugin with an interactive IDE side-pane, SigTrace captures reactivity boundaries at compilation, streams runtime metrics locally, and lets developers jump from a visual graph node directly to its matching line of source code.

[Declaring Code] ──(Vite AST Compilation)──► [Core Runtime] ──(WebSockets)──► [VS Code View]
  (Auto-Linked)                                                                 (Bi-Directional)

  2. Target Audience & Personas
Performance Engineers: Developers building data-heavy SaaS dashboards, dynamic visual interfaces, or real-time analytics widgets where high-frequency updates can easily choke the browser's main thread.  

Enterprise Teams Migrating to Signals: Teams migrating older codebases to modern signal engines (e.g., transitioning traditional Angular to zoneless signals, or Vue VDOM to Vue Vapor) who need to ensure correct signal dependency registrations.  

Multi-Framework/Meta-Framework Innovators: Engineers using tools like Astro to run multiple independent islands (e.g., Svelte, React, Vue) on a single page, needing a single unified panel to track state flowing across framework boundaries.

3. Product Functional Architecture
SigTrace consists of three closely coupled components:

+---------------------------------------------------------------------------------+
|                                 DEVELOPER WORKSPACE                             |
|                                                                                 |
|  +---------------------------+        Local WebSockets        +--------------+  |
|  |     Vite Server Engine    | ─────────────────────────────► | VS Code view |  |
|  |  @sigtrace/vite (AST Inject)                               | (D3 Graph)   |  |
|  +---------------------------+                                +--------------+  |
|                │                                                     │          |
|                ▼                                                     ▼          |
|       [Browser App Shell] ──────────────────────────────────► [Source Code File] |
|       @sigtrace/core (Inject Client)                           (Direct Cursor Jump)
+---------------------------------------------------------------------------------+

3.1 Component A: @sigtrace/vite (The Build-Time Instrumenter)
An AST (Abstract Syntax Tree) compiler plugin designed for Vite.  

Traverses source files (.ts, .tsx, .vue, .svelte, .tsrx) to find reactive primitives (signal, $state, computed, effect, ref).  

Injects runtime tracking hooks before the minification and bundling step, preserving readable variable names and mapping exact file/line source ranges.

3.2 Component B: @sigtrace/core (The Lightweight Client Client)
A runtime client injected into the browser dev bundle.  

Monkeys-patches standard reactivity interfaces or TC39 signal specifications.  

Streams trace event payloads (registrations, reads, writes, recalculation intervals, and graph link/unlink cycles) over a local WebSocket connection to the IDE.  

3.3 Component C: SigTrace VS Code DevTools (The IDE Visualizer)
A VS Code/Cursor Extension housing an interactive Webview pane powered by D3.js or Canvas.  

Provides an interactive visual tree-graph of all application signals.  

Integrates natively with VS Code workspace APIs to handle editor highlighting and direct code navigation.

4. Feature Specifications
4.1 Feature 1: Dynamic Dependency Graph Visualizer
Description: An interactive graphical node system mapping how state propagates through the reactive graph.

Behavior:

Nodes are color-coded by reactive type:  

Blue: Writable Signals/State.  

Green: Computed/Derived derivations.  

Purple: Observer Effects/Side Effects.  

Gray: DOM/Template sinks.  

Directed arrows indicate dependency tracking direction.  

Hovering over any node displays metadata including: Epoch (update count), Current Value, Execution Time, and Module Source Path.  

Real-time animation flashes nodes when they undergo active updates or invalidation.

4.2 Feature 2: Bi-Directional "Graph-to-Code" Cursor Jumping
Description: Direct link between visual nodes in the Webview panel and actual lines of code in the editor workspace.  

Behavior:

Double-clicking on any node in the visualizer pane triggers an IDE focus action.  

VS Code opens the corresponding component or store file and places the cursor on the exact line where the signal, computed derivation, or effect is declared.

4.3 Feature 3: Dynamic Tracking & "Ghost Update" Detection
Description: Alerting developers to unexpected dependency changes caused by conditional branches inside effects.  

Behavior:

When a signal is dynamically excluded from an observer's tracking scope due to a code condition, the graph arrow changes to a dashed line.  

Displays runtime warnings inside the graph for common reactivity bugs, such as "Cascading Computeds" (excessive computation chains) or "Circular Invalidations" (infinite render loops).


4.4 Feature 4: "Observer Tax" Optimization & Timing Profiler
Description: A lightweight profiler mapping execution cost to pinpoint laggy computed functions.  

Behavior:

Tracks how long computed functions take to resolve.  

Nodes that exceed the execution safety threshold turn yellow or red (Hotspots).  

Allows developers to toggle the tracing suite off during pure layout testing to reduce GC (Garbage Collection) overhead.

```
5. Technical Requirements & Integration
5.1 Workspace Configuration
SigTrace requires zero manual import footprints in production environments. It is strictly configured inside vite.config.ts:

// vite.config.ts
import { defineConfig } from 'vite';
import { sigTrace } from '@sigtrace/vite';

export default defineConfig({
  plugins: [
    sigTrace({
      enabled: process.env.NODE_ENV === 'development',
      port: 8420, // Dedicated default websocket port
    }),
  ],
});
```


5.2 Framework-Specific Adapter Strategies
Because reactive execution models differ, the @sigtrace/vite plugin uses compilation adapters:

FrameworkReactivity  Hook  TargetInjection/Capture Mechanism
Svelte 5	Runes AST Traversal   Wraps $state() and $derived() during compiler plugin transform.  

Vue 3 / Vapor	Reactive Ref Proxy Hook  Intercepts Vue's runtime reactivity hooks (onRenderTracked/onRenderTriggered).  

Angular 21+	Angular Signals & Scheduler  Injects custom interceptors into Angular's DevTools signal trace interface.  

SolidJS	Getter/Setter Primitives  Intercepts Solid's internal reactivity graph tracker during development bundles.



6. Non-Functional Requirements & Performance Budgets6.1 Performance Overhead LimitsRunning a real-time visual debugger can easily overwhelm runtime budgets.Let the added CPU execution time overhead $O_{prof}$ be defined as:
$$O_{prof} = \sum_{i=1}^{n} (T_{serialize}(e_i) + T_{transmit}(e_i))$$


$$O_{prof} = \sum_{i=1}^{n} (T_{serialize}(e_i) + T_{transmit}(e_i))$$where $n$ is the number of reactive state updates per second, $T_{serialize}$ is the serialization cost of signal payload $e_i$, and $T_{transmit}$ is the WebSocket transmission delay.


To maintain a fluid $60$ frames per second (fps) developer preview, $O_{prof}$ must be kept below $1.67$ milliseconds (representing less than $10\\%$ of the browser's standard $16.67$ milliseconds frame budget).

Runtime Memory Ceiling: Under peak high-frequency workloads (e.g., 200 state updates per second), the runtime client's additional heap allocation must not exceed $5$ Megabytes.Webview Frame Budgets: The VS Code graphic canvas must execute panning, zooming, and node layout steps at a stable $60$ fps on a typical developer machine.

6.2 Browser and Environment Constraints
Vite Version Compatibility: Supports Vite 5 and Vite 6 (including Rolldown targets).
IDE Support: Fully compatible with VS Code 1.80+ and Cursor IDE (using modern VS Code Extension Webview API targets).

HSTS Compliance: The visualizer playground and documentation served at sigtrace.dev must strictly configure Google’s HSTS preload criteria, serving traffic exclusively over secure HTTPS protocols.


┌─────────────────────────────────┐
│ PHASE 1: SolidJS & Svelte 5 MVP │
│ - Core WS connection            │
│ - Node tree visual rendering    │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ PHASE 2: Vue 3.6 & Angular      │
│ - Bi-directional IDE jumping    │
│ - Performance profiler hotspots │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ PHASE 3: Universal Signals (TC39)│
│ - Webview UX polish             │
│ - Multi-framework Astro tracing │
└─────────────────────────────────┘

Phase 1 (MVP Launch):

Deliver the core @sigtrace/vite plugin and VS Code Extension.  

Build first-class, optimized support specifically for SolidJS and Svelte 5. These frameworks represent the cleanest compile-time targets, making AST-based signal registration straightforward.  

Establish sigtrace.dev as the official documentation hub and launch an interactive web-based playground.  

Phase 2 (Ecosystem Expansion):

Deliver official integration adapters for Vue 3.6 Vapor and Angular 21+.  

Launch bi-directional cursor jumping from visual graphs back into source code files.  

Integrate performance hotspots visualization (flagging slow computed properties).  

Phase 3 (Universal Standardization & Launch):

Integrate native compatibility for the final browser TC39 Signals API specification.  

Introduce multi-framework mapping, allowing the tracking of signals flowing across server-client boundaries or multi-framework setups like Astro.  

Acquire the VS Code Verified Publisher status for the Extension Marketplace by validating ownership of the sigtrace.dev domain.