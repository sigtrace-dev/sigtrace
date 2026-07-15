# `@sigtrace/core`

> Lightweight runtime telemetry client and framework-agnostic adapters for **SigTrace**, the Universal Reactivity Graph & Signal Lifecycle Tracer.

[![NPM Version](https://img.shields.io/npm/v/@sigtrace/core.svg)](https://www.npmjs.com/package/@sigtrace/core)
[![License](https://img.shields.io/npm/l/@sigtrace/core.svg)](https://github.com/sigtrace/sigtrace/blob/main/LICENSE)

`@sigtrace/core` connects fine-grained reactive runtimes directly to your VS Code editor. It maps the dependencies, writes, reads, and execution timings of signals, computed memos, and side-effect reactions, streaming live telemetry to the SigTrace VS Code sidebar panel.

---

## Key Features

- ⚡ **Zero-Refactoring CLI Loader**: Run your dev server with `npx sigtrace run <serve-command>` to dynamically inject tracking compile hooks into Angular, Vue, or SolidJS with zero source code or config file modifications.
- 🔵 **Framework-Agnostic Adapters**: Specialized wrappers for **Angular Signals**, **Vue 3 Reactivity (Refs/Computed)**, and **SolidJS Signals/Memos/Effects**.
- 🚨 **Reactivity Loop Protection**: Automatically flags circular invalidation cycles (infinite render loops) and pauses execution before the browser tab freezes.
- ⏱️ **Computation Hotspot Alerts**: Pinpoints expensive computed derivations that take longer than 2.0ms, identifying UI lag bottlenecks.
- ⚠️ **Dead Code Detection**: Identifies declared signals that write state but are never observed by any template or reactive consumer.

---

## Installation

Add `@sigtrace/core` to your development dependencies:

```bash
# Using npm
npm install @sigtrace/core --save-dev

# Using yarn
yarn add @sigtrace/core --dev
```

---

## Quickstart: Zero-Refactoring Integration

Instead of rewriting your project's code imports or build configuration files, simply prefix your normal startup command with our CLI wrapper:

```bash
# For Angular CLI
npx sigtrace run ng serve

# For Vite / Vue / SolidJS
npx sigtrace run yarn develop
# or
npx sigtrace run npm run start
```

### How it works:
1. The CLI registers the Node compilation preloader in your local workspace environment.
2. It compiles the JavaScript/TypeScript code in memory, rewriting imports (e.g. `from '@angular/core'` to `from '@sigtrace/core/angular'`) on the fly.
3. Your code files on disk remain 100% clean and untouched.

---

## API Reference: Manual Programmatic Wrappers

If you prefer manual programmatic mapping, import the wrapped primitives directly from our adapters:

### SolidJS
```typescript
import { createSignal, createMemo, createEffect } from '@sigtrace/core/solid';

const [count, setCount] = createSignal(0, { name: 'myCount' });
const double = createMemo(() => count() * 2, undefined, { name: 'doubleCount' });
```

### Vue 3
```typescript
import { ref, computed, watchEffect } from '@sigtrace/core/vue';

const count = ref(0, { name: 'myCount' });
const double = computed(() => count.value * 2, { name: 'doubleCount' });
```

### Angular (v16+)
```typescript
import { signal, computed, effect } from '@sigtrace/core/angular';

const count = signal(0, { name: 'myCount' });
const double = computed(() => count() * 2, { name: 'doubleCount' });
```

---

## Search Engine Ranking Keywords
Fine-grained reactivity, signals debugger, Angular Signals tracer, SolidJS createMemo tracing, Vue Ref trace, dependency graph visualizer, VS Code telemetry overlay, state flow profiler, reactivity loop safeguard, dynamic tracking analyzer.

## License

[MIT](LICENSE)
