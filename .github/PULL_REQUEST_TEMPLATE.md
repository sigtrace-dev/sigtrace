## 📋 Description

<!-- Provide a clear and concise description of the change. What problem does it solve or what feature does it add? Link to the relevant issue(s) if applicable. -->

Closes #<!-- issue number -->

---

## 🔀 Type of Change

<!-- Check all that apply -->

- [ ] 🐛 **Bug fix** – non-breaking change that fixes an issue
- [ ] ✨ **New feature** – non-breaking change that adds functionality
- [ ] 💥 **Breaking change** – fix or feature that causes existing functionality to change in a backward-incompatible way
- [ ] 📖 **Documentation** – changes to docs, comments, or README only
- [ ] 🔧 **Refactor** – code restructuring without behavior changes
- [ ] ⚡ **Performance** – change that improves performance
- [ ] 🧪 **Tests** – adding or updating tests without other logic changes
- [ ] 🔨 **Build / CI** – changes to the build system, GitHub Actions, or tooling configuration
- [ ] 🎨 **Style** – formatting, code style, linting fixes (no logic change)

---

## 🧪 Testing

<!-- Describe how you tested this change. -->

**Test environment:**
- OS: <!-- e.g., macOS 14.5 (Apple Silicon) -->
- Node version: <!-- e.g., 20.14.0 -->
- Framework: <!-- e.g., Angular 17.3 -->
- SigTrace version: <!-- e.g., 1.1.3-dev -->

**Testing steps performed:**

- [ ] Compiled all packages successfully (`npm run compile`)
- [ ] Manually tested the change in the `demo/` reference app
- [ ] Tested the VS Code extension via F5 Extension Development Host
- [ ] Verified that CodeLens overlays still render correctly (if touching `vite-plugin` or `core`)
- [ ] Verified that the Dashboard UI (Activity Table, Timeline, Component Cards) is unaffected (if not intentionally changing it)
- [ ] Tested on the affected framework(s): <!-- Angular / Vue / SolidJS / all -->

---

## 📸 Screenshots / Recordings

<!-- For changes that affect the DevTools UI, please include before/after screenshots or a short screen recording. This significantly speeds up review. -->

| Before | After |
|--------|-------|
| <!-- screenshot or "N/A" --> | <!-- screenshot or "N/A" --> |

---

## ⚠️ Breaking Changes

<!-- If this is a breaking change, describe what breaks and provide a migration path. -->

None <!-- or describe the breaking change here -->

---

## 📝 Additional Notes

<!-- Anything else reviewers should know? Known limitations, follow-up issues, tradeoffs made, etc. -->
