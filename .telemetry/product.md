# Product: SigTrace

**Last updated:** 2026-09-10
**Method:** codebase scan + conversation

## Product Identity
- **One-liner:** A developer drops SigTrace into their Vite build, and it draws a live map of every reactive signal in their app — every read, write, and effect — right inside their editor; when an update misfires or loops, they watch it happen on the graph and click straight to the line of code responsible, instead of guessing.
- **Category:** developer-tooling (IDE debugger / build-time instrumentation)
- **Product type:** B2C / prosumer today, with a stated ambition toward enterprise adoption. There is no account or organization concept in the product at all — every install is a fully independent, anonymous instance.
- **Collaboration:** single-player. Each developer runs their own local instance against their own local app; there is no shared session, no multi-user view, and no way for two people to look at the same trace together today.

## Business Model
- **Monetization:** free / open-source under the Elastic License 2.0 (ELv2). No paid tier exists today.
- **Pricing tiers:** none currently shipped. The team explored moving to an open-core freemium-to-premium model this session and reached two firm decisions rather than a shipped plan: (1) no new paid features will be built until there is real signal to justify them, and (2) that signal will come from an explicit, opt-in public feedback/community channel (e.g. GitHub Discussions), not from passive runtime telemetry — the team judged that a phone-home mechanism in a localhost-only debugging tool creates more enterprise security-review and community-trust risk than the data would be worth. This is a deliberate, recorded product stance, not an oversight.
- **Billing integration:** none. No billing code, license-key validation, or payment integration exists anywhere in the codebase.

## Tech Stack
- **Primary language:** TypeScript (core runtime, Vite plugin, VS Code extension); Kotlin (JetBrains plugin)
- **Framework:** none in the application-framework sense — the product is built directly against the Vite plugin API, the VS Code Extension API, and the JetBrains Plugin SDK (with Ktor used for the JetBrains-side WebSocket server)
- **Database:** none. There is no persistence layer anywhere — all state is in-memory for the life of a single debugging session and is discarded on reload.
- **Background jobs:** none.
- **HTTP client patterns:** none for outbound calls; the only network activity is a local WebSocket server (`ws` in the VS Code extension, Ktor WebSockets in the JetBrains plugin) bound to `localhost`, carrying instrumentation events from the running app to the IDE panel. No process in the product makes an outbound network call off the developer's machine.
- **Module organization:** npm workspaces monorepo — `packages/core` (@sigtrace/core), `packages/vite-plugin` (@sigtrace/vite-plugin), `packages/extension` (VS Code), `packages/jetbrains-plugin` (JetBrains/Kotlin), plus a `demo` app and a `docs` marketing/documentation site.

## Value Mapping

### Primary Value Action
**Watch a live signal update and jump to its source.** A developer sees a signal read, write, computed recalculation, or effect fire on the graph/table/timeline in real time, and can click through to the exact line of code responsible. If the event stream stops being trustworthy or the visualization becomes unreadable, the product has failed — the entire promise is "see it happen, then go fix it," not just "collect the data."

### Core Features (directly deliver value)
1. **Live Activity Table** — a real-time, filterable, pinnable log of every signal read/write/effect with an inline JSON value inspector. This is the primary surface developers watch while reproducing a bug.
2. **Timeline / Causal Chains** — chronological swimlane view of sequential update chains, with ghost-update and circular-invalidation detection, so a developer can see *why* a chain of updates happened, not just that it did.
3. **Dependency Graph Visualizer** — the interactive node graph (per the PRD) mapping how state propagates, color-coded by signal/computed/effect/DOM-sink type.
4. **Click-to-Navigate** — double-clicking any node, row, or timeline card jumps the editor cursor to the exact declaration line. This is what converts "I can see the bug" into "I fixed the bug," and is the feature that makes the other three worth using.

### Supporting Features (enable core actions)
1. **Component Audits** — groups updates by component, flags circular-invalidation loops, computation hotspots (>2.0ms), and dead signals, so a developer knows *where* to look before diving into the table or graph.
2. **AST-based Vite instrumentation** — the build-time compiler pass that makes zero-refactor setup possible; instrumentation only runs in development, so production bundles are untouched. This is the enabling mechanism, not something a user interacts with directly.
3. **Dual-IDE support (VS Code + JetBrains)** — the same debugging capability delivered natively in both major IDE families, so adoption isn't gated by editor choice.

## Entity Model

### Users
- **ID format:** not applicable — the product has no concept of a user identity. There is no login, no device ID persisted across sessions, and no way to distinguish one developer's install from another's.
- **Roles:** none.
- **Multi-account:** not applicable — there are no accounts.

### Accounts
- **ID format:** not applicable — no account entity exists.
- **Hierarchy:** not applicable — flat, single-tenant-per-machine by construction; there is no organization or team concept anywhere in the product today.

## Group Hierarchy

Not applicable. SigTrace has no groups, organizations, workspaces, or any multi-level entity — every install is an independent, isolated instance with no relationship to any other install. This is a direct consequence of the product being local-only with no backend; introducing any group hierarchy would require building an account/backend layer that does not exist today.

| Group Type | Parent | Where Actions Happen |
|------------|--------|---------------------|
| — | — | — |

**Default event level:** not applicable (no groups)
**Admin actions at:** not applicable (no groups)

## Current State
- **Existing tracking:** none. Confirmed by a full-repository scan for analytics/telemetry SDK patterns (Stripe, Segment, Amplitude, Mixpanel, PostHog, generic "analytics"/"telemetry" strings) — zero hits outside third-party vendored files (a bundled `d3.min.js`) and the marketing PRD's own prose. The product has never collected usage data.
- **Documentation:** yes, and mature — a public marketing/docs site (sigtrace.dev), a detailed README, a formal PRD, CONTRIBUTING.md, SECURITY.md, and CODE_OF_CONDUCT.md all exist and are current as of the latest release (v1.2.1).
- **Known issues (resolved this session):** two live-update scroll-reset bugs — the Activity tab's default sort-by-update-count re-ordering rows under a fixed scroll offset during continuous live events, and the Value tab only preserving scroll on node-switch rather than on in-place live updates to the currently viewed node — plus a non-responsive Activity table (`overflow-x:hidden` with no minimum width, clipping columns instead of scrolling) were diagnosed and fixed in `packages/extension/src/webview/` and mirrored into the identical `packages/jetbrains-plugin/src/main/resources/webview/` copy. Not yet rebuilt into new `.vsix`/Gradle release artifacts.
- **Recorded product decision:** after evaluating a freemium-to-premium path, the team explicitly decided *against* adding runtime telemetry, judging the trust/security cost (particularly for enterprise teams whose security review processes flag dev tools that make outbound network calls) higher than the analytics value. Future product decisions will lean on direct, opt-in community feedback instead of passive usage data — see Integration Targets below.

## Integration Targets

| Destination | Purpose | Priority |
|-------------|---------|----------|
| None (by decision) | The team has deliberately chosen not to integrate any analytics/telemetry destination. See Current State above for the reasoning. | N/A |
| GitHub Discussions (proposed, not yet built) | A public, opt-in feedback and feature-request channel, positioned as a direct substitute for the demand-validation signal telemetry would otherwise provide. Nothing leaves a user's machine unless they manually click through and post. | Proposed |

## Codebase Observations
- **Feature areas inferred:** activity/event log, causal timeline, component/hotspot audit, alerts, and a dedicated value inspector — inferred directly from the tab structure in `packages/extension/src/webview/app.js` and mirrored in the JetBrains webview resources.
- **Entity model inferred:** there are no database models or schema anywhere in the codebase. The only "entities" are runtime, in-memory concepts — a signal/computed/effect node, a component, and a causal chain/event — that exist only for the duration of a single debugging session and are discarded on reload or on hitting "Clear." Nothing about a signal, a component, or a chain is ever persisted to disk or sent off the developer's machine.
