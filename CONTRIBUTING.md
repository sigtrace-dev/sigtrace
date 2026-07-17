# Contributing to SigTrace

First off — thank you for taking the time to contribute! 🎉

SigTrace is an open-source project and we welcome contributions of all kinds: bug fixes, new features, documentation improvements, and issue reports. This guide will walk you through everything you need to get started.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Project Structure](#project-structure)
- [Running the Demo](#running-the-demo)
- [Running the VS Code Extension Locally](#running-the-vs-code-extension-locally)
- [Branching Strategy](#branching-strategy)
- [Commit Message Conventions](#commit-message-conventions)
- [Pull Request Process](#pull-request-process)
- [Code Review Expectations](#code-review-expectations)
- [Release Process](#release-process)
- [Getting Help](#getting-help)

---

## Prerequisites

Before you begin, ensure you have the following installed:

| Tool         | Minimum Version | Notes                                        |
|--------------|-----------------|----------------------------------------------|
| **Node.js**  | 18.x or higher  | We recommend the latest LTS release          |
| **npm**      | 9.x or higher   | Bundled with Node; or use **pnpm** (preferred) |
| **pnpm**     | 8.x (optional)  | Faster installs; `npm install -g pnpm`        |
| **VS Code**  | 1.85+           | Required to develop the extension package    |
| **Git**      | 2.x             | Standard version control                     |

> **Tip**: Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to manage Node versions easily.

---

## Local Setup

### 1. Fork and Clone

```bash
# Fork the repo on GitHub, then clone your fork:
git clone https://github.com/<your-username>/sigtrace.git
cd sigtrace
```

### 2. Install Dependencies

SigTrace is a monorepo managed with npm workspaces. Install all dependencies from the root:

```bash
npm install
# or, if using pnpm:
pnpm install
```

### 3. Build All Packages

Compile the TypeScript source for all packages:

```bash
npm run compile
```

This runs `tsc` sequentially for `packages/core`, `packages/vite-plugin`, and `packages/extension`.

### 4. Watch Mode (Optional)

For active development, you can run TypeScript in watch mode per-package. Open multiple terminals:

```bash
# Terminal 1 – core
tsc -p packages/core --watch

# Terminal 2 – vite-plugin
tsc -p packages/vite-plugin --watch

# Terminal 3 – extension
tsc -p packages/extension --watch
```

---

## Project Structure

```
sigtrace/
├── packages/
│   ├── core/               # @sigtrace/core
│   │   ├── src/
│   │   │   ├── server.ts   # WebSocket server that receives signal events
│   │   │   ├── types.ts    # Shared event & payload type definitions
│   │   │   └── index.ts    # Public API exports
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── vite-plugin/        # @sigtrace/vite-plugin
│   │   ├── src/
│   │   │   ├── plugin.ts   # Vite plugin entry; wires up the transform
│   │   │   ├── transform.ts # AST instrumentation (acorn/typescript-estree)
│   │   │   └── register.cjs # CJS-compatible rxjs-interop import rewriter
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── extension/          # VS Code extension (sigtrace-devtools)
│       ├── src/
│       │   ├── extension.ts        # Extension activation & command registration
│       │   ├── SigTracePanel.ts    # WebviewPanel host & WebSocket bridge
│       │   ├── CodeLensProvider.ts # Inline CodeLens overlays on signal reads
│       │   └── webview/            # Dashboard UI (HTML/CSS/TS, bundled)
│       │       ├── index.html
│       │       ├── dashboard.ts    # Activity table, timeline, component cards
│       │       └── graph.ts        # D3 force-directed signal graph
│       ├── package.json
│       └── tsconfig.json
│
├── demo/                   # Reference Angular app wired to sigtrace
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── package.json            # Monorepo root (npm workspaces)
└── tsconfig.json           # Root TypeScript project references
```

### Package Responsibilities

| Package                  | npm Name               | Purpose                                                   |
|--------------------------|------------------------|-----------------------------------------------------------|
| `packages/core`          | `@sigtrace/core`       | WebSocket server + shared type contracts                  |
| `packages/vite-plugin`   | `@sigtrace/vite-plugin`| Build-time AST instrumentation for signals                |
| `packages/extension`     | *(VS Code marketplace)*| DevTools panel: graph, dashboard, CodeLens, source nav    |

---

## Running the Demo

The `demo/` directory contains a reference Angular application that demonstrates SigTrace in action.

### Steps

```bash
# 1. Navigate to the demo directory
cd demo

# 2. Install demo dependencies (separate from root workspace)
npm install

# 3. Start the dev server (Vite + SigTrace instrumentation)
npm run start
```

This will:
1. Launch the Vite dev server at `http://localhost:5173`
2. Start the SigTrace WebSocket server on port `7337`
3. Instrument all Angular signal reads/writes at compile time

### Connecting the Extension

Once the demo is running:

1. Open the `sigtrace` monorepo root in VS Code
2. Run **SigTrace: Open DevTools Panel** from the Command Palette (`Cmd+Shift+P`)
3. The extension will connect to `ws://localhost:7337` and begin streaming signal events

> **Note**: You can also use the `sigtrace` CLI as an alternative to the Vite plugin:
> ```bash
> npx sigtrace ./src/main.ts
> ```

---

## Running the VS Code Extension Locally

SigTrace's extension can be tested directly in VS Code using the built-in Extension Host.

### Steps

1. Open the monorepo root in VS Code:
   ```bash
   code /path/to/sigtrace
   ```

2. Make sure you've compiled the extension:
   ```bash
   npm run compile
   ```

3. Press **F5** (or go to **Run and Debug → Launch Extension**)

   This opens a new **Extension Development Host** window with the SigTrace extension loaded from your local source.

4. In the Extension Development Host window:
   - Open a project that uses `@sigtrace/vite-plugin`
   - Start the dev server in that project
   - Open the Command Palette and run **SigTrace: Open DevTools Panel**

5. Make changes to the source, recompile (`npm run compile`), and reload the Extension Host (`Cmd+R` in the host window).

> The `.vscode/launch.json` in this repo is pre-configured for F5 development. No additional setup is required.

---

## Branching Strategy

We follow a simplified GitFlow model:

| Branch           | Purpose                                                     |
|------------------|-------------------------------------------------------------|
| `main`           | **Stable** – always reflects the latest published release   |
| `develop`        | **Active development** – integration branch for features    |
| `feature/<name>` | Feature branches – branch off `develop`, merge back to `develop` |
| `fix/<name>`     | Bug fix branches – branch off `develop` (or `main` for hotfixes) |
| `release/<ver>`  | Release prep branches – branched from `develop`, merged to both `main` and `develop` |

### Branch Naming Examples

```
feature/vue3-adapter
feature/solid-js-support
fix/codelens-flicker-on-reload
release/1.2.0
```

### Workflow

```bash
# Start a new feature
git checkout develop
git pull origin develop
git checkout -b feature/my-feature

# ... make changes ...

git add .
git commit -m "feat(core): add support for computed signal batching"
git push origin feature/my-feature

# Open a Pull Request targeting 'develop'
```

---

## Commit Message Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) to keep our history readable and to automatically generate changelogs.

### Format

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

### Types

| Type       | When to use                                             |
|------------|---------------------------------------------------------|
| `feat`     | A new feature                                           |
| `fix`      | A bug fix                                               |
| `docs`     | Documentation only changes                             |
| `style`    | Formatting, missing semicolons – no logic change        |
| `refactor` | Code restructuring without new features or bug fixes    |
| `perf`     | Performance improvements                                |
| `test`     | Adding or fixing tests                                  |
| `build`    | Build system or dependency changes                      |
| `ci`       | CI/CD configuration changes                             |
| `chore`    | Housekeeping (updating .gitignore, etc.)                |

### Scopes

Use the package or area affected: `core`, `vite-plugin`, `extension`, `demo`, `docs`, `ci`

### Examples

```bash
feat(extension): add click-to-navigate from signal node to source file
fix(vite-plugin): handle toSignal wrapped in arrow function correctly
docs(contributing): clarify F5 launch steps for extension development
perf(core): reduce WebSocket message overhead with binary framing
build(ci): add Node 20 matrix to CI workflow
```

### Breaking Changes

Append `!` after the type/scope and add a `BREAKING CHANGE:` footer:

```bash
feat(core)!: remove deprecated startServer() API

BREAKING CHANGE: Use createServer() instead. startServer() has been removed.
```

---

## Pull Request Process

1. **Target the right branch**: PRs with new features should target `develop`. Hotfixes may target `main` directly.

2. **Keep PRs focused**: One feature or fix per PR makes review easier and reduces merge conflicts.

3. **Fill out the PR template**: Complete all sections of the pull request template, including the testing checklist.

4. **Ensure CI passes**: All checks (lint, type-check, compile) must pass before review.

5. **Request a review**: Tag a maintainer for review. Don't merge your own PRs without approval.

6. **Squash and merge**: Maintainers will squash commits on merge to keep `develop` and `main` history clean.

---

## Code Review Expectations

As a **reviewer**, we expect you to:
- Review within 2–3 business days of being requested
- Leave actionable, constructive feedback
- Approve only when you are genuinely satisfied with the change
- Ask questions if something is unclear — don't assume intent

As a **contributor**, we expect you to:
- Respond to review comments within a reasonable timeframe
- Resolve all open review threads before re-requesting review
- Not take review feedback personally — we're all working toward a better tool

---

## Release Process

Releases are managed by maintainers and follow these steps:

1. **Create a `release/<version>` branch** from `develop`
2. **Update `CHANGELOG.md`** with the new version section and release notes
3. **Bump package versions** in all `package.json` files
4. **Open a PR** from the release branch to `main`
5. Once merged, **tag the commit**: `git tag v1.2.0 && git push origin v1.2.0`
6. The **`release.yml` GitHub Action** automatically:
   - Publishes `@sigtrace/core` and `@sigtrace/vite-plugin` to npm
   - Packages and publishes the VS Code extension to the marketplace via `vsce`
7. **Merge the release branch back into `develop`**

---

## Getting Help

- 💬 **Discord**: Join our community at [discord.gg/sigtrace](https://discord.gg/sigtrace)
- 🐛 **Bugs**: Open a [bug report](https://github.com/sigtrace-dev/sigtrace/issues/new?template=bug_report.yml)
- 💡 **Ideas**: Open a [feature request](https://github.com/sigtrace-dev/sigtrace/issues/new?template=feature_request.yml)
- 📖 **Docs**: [sigtrace.dev/docs](https://sigtrace.dev/docs)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/sigtrace-dev/sigtrace/discussions)
