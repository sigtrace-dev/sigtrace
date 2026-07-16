# `@sigtrace/vite`

> Vite compilation plugin and Babel AST transformer for **SigTrace**, the Universal Reactivity Graph & Signal Lifecycle Tracer.

[![NPM Version](https://img.shields.io/npm/v/@sigtrace/vite.svg)](https://www.npmjs.com/package/@sigtrace/vite)
[![License](https://img.shields.io/npm/l/@sigtrace/vite.svg)](https://github.com/sigtrace-dev/sigtrace/blob/main/LICENSE)

`@sigtrace/vite` is a development-time Vite plugin that parses your TypeScript, JSX, and TSX files as an AST, extracts signal variable declarations, and automatically injects variable names and source-code file location metadata into your reactive creator functions.

---

## Features

- 🔬 **Automated AST Instrumentation**: Converts `const count = signal(0)` into `signal(0, { name: 'count', __source: { file: 'App.tsx', line: 12 } })` behind the scenes during compilation.
- 🎯 **Component Detection**: Identifies the enclosing class or function name (e.g. `SearchResultsComponent`) and links your signals to their visual component groups.
- 🔗 **Resolve Alias Redirects**: Automatically intercepts framework imports (`solid-js`, `vue`, `@angular/core`) and redirects them to the `@sigtrace/core` adapters during development.
- 🛡️ **Dev-Mode Only**: Automatically limits transformations to serve/dev environments (`command === 'serve'`), ensuring zero performance impact or bundle weight in production builds.

---

## Installation

Add `@sigtrace/vite` to your development dependencies:

```bash
# Using npm
npm install @sigtrace/vite --save-dev

# Using yarn
yarn add @sigtrace/vite --dev
```

---

## Usage

Configure the plugin in your project's `vite.config.ts` or `vite.config.js` file:

```typescript
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid'; // or vue()
import { sigTrace } from '@sigtrace/vite';

export default defineConfig({
  plugins: [
    sigTrace({
      enabled: true, // Optional: defaults to true
      port: 8420     // Optional: WebSockets port, defaults to 8420
    }),
    solid()
  ]
});
```

---

## Search Engine Ranking Keywords
Vite plugin, Babel compiler transformer, AST signal injection, SolidJS memo tracking, Vue ref tracing, reactive graph compiler, @sigtrace/core resolver, code source jump, Visual Studio Code sidebar telemetry.

## License

[MIT](LICENSE)
