#!/usr/bin/env bash
#
# build-and-check-publish-targets.sh
#
# Builds SigTrace's publishable packages and reports which distribution
# platforms you're actually ready to publish to right now (build tool
# present + credentials found), without publishing anything itself.
#
# Usage:
#   ./scripts/build-and-check-publish-targets.sh            # build + report
#   ./scripts/build-and-check-publish-targets.sh --check     # report only, skip builds
#   ./scripts/build-and-check-publish-targets.sh --build     # build only, skip report
#
# This script never runs a publish/upload command. It only builds artifacts
# locally and tells you what's missing for each platform. Publishing is a
# one-way action against a real marketplace — you run those commands
# yourself, on purpose, when you're ready (see the printed hints below).

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-all}"   # all | --check | --build
DO_BUILD=true
DO_CHECK=true
case "$MODE" in
  --check) DO_BUILD=false ;;
  --build) DO_CHECK=false ;;
  all|"") ;;
  *) echo "Unknown argument: $MODE (expected --check or --build)"; exit 1 ;;
esac

BOLD="$(tput bold 2>/dev/null || true)"
DIM="$(tput dim 2>/dev/null || true)"
RESET="$(tput sgr0 2>/dev/null || true)"
GREEN="$(tput setaf 2 2>/dev/null || true)"
YELLOW="$(tput setaf 3 2>/dev/null || true)"
RED="$(tput setaf 1 2>/dev/null || true)"

ok()   { echo "  ${GREEN}✓${RESET} $1"; }
warn() { echo "  ${YELLOW}!${RESET} $1"; }
fail() { echo "  ${RED}✗${RESET} $1"; }
hr()   { echo "${DIM}--------------------------------------------------------------------${RESET}"; }

VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")"

echo "${BOLD}SigTrace publish-target build & readiness report${RESET}  (v$VERSION)"
hr

# ── 1. BUILD ────────────────────────────────────────────────────────────────
if [ "$DO_BUILD" = true ]; then
  echo "${BOLD}Building packages...${RESET}"

  echo "  - Compiling core / vite-plugin / extension (tsc)"
  if npm run compile --silent > /tmp/sigtrace-build-compile.log 2>&1; then
    ok "TypeScript compile succeeded"
  else
    fail "TypeScript compile failed — see /tmp/sigtrace-build-compile.log"
  fi

  echo "  - Packaging VS Code extension (.vsix)"
  if ! command -v vsce >/dev/null 2>&1 && ! npx --no-install vsce --version >/dev/null 2>&1; then
    warn "vsce not installed — run: npm install -g @vscode/vsce"
  else
    ( cd packages/extension && npx vsce package --no-dependencies -o "sigtrace-devtools-${VERSION}.vsix" \
        > /tmp/sigtrace-build-vsce.log 2>&1 ) \
      && ok "VSIX built: packages/extension/sigtrace-devtools-${VERSION}.vsix" \
      || fail "vsce package failed — see /tmp/sigtrace-build-vsce.log"
  fi

  echo "  - Building JetBrains plugin distribution (Gradle)"
  if [ -x packages/jetbrains-plugin/gradlew ]; then
    JAVA_MAJOR="$(java -version 2>&1 | grep -oE '"[0-9]+' | head -1 | tr -d '"')"
    if [ -n "$JAVA_MAJOR" ] && [ "$JAVA_MAJOR" -lt 17 ] 2>/dev/null; then
      warn "Detected JDK $JAVA_MAJOR — this plugin targets JDK 17 (see build.gradle.kts). Install/select JDK 17+ before building, or the Gradle build below may fail."
    fi
    ( cd packages/jetbrains-plugin && ./gradlew buildPlugin --console=plain \
        > /tmp/sigtrace-build-gradle.log 2>&1 ) \
      && ok "JetBrains plugin ZIP built: packages/jetbrains-plugin/build/distributions/" \
      || fail "Gradle buildPlugin failed — see /tmp/sigtrace-build-gradle.log (first Gradle run also needs network access to download the IntelliJ Platform SDK)"
  else
    fail "packages/jetbrains-plugin/gradlew not found or not executable"
  fi

  hr
fi

# ── 2. PLATFORM READINESS ────────────────────────────────────────────────────
if [ "$DO_CHECK" = true ]; then
  echo "${BOLD}Publish-target readiness${RESET}"
  echo "${DIM}(checks for the CLI tool + a credential; never runs a publish command)${RESET}"
  echo

  # -- npm --------------------------------------------------------------------
  echo "${BOLD}npm registry${RESET}  (@sigtrace/core, @sigtrace/vite-plugin) — already live"
  if [ -n "${NODE_AUTH_TOKEN:-}" ] || [ -n "${NPM_TOKEN:-}" ]; then
    ok "npm auth token found in environment"
  elif npm whoami >/dev/null 2>&1; then
    ok "npm CLI is logged in as $(npm whoami 2>/dev/null)"
  else
    warn "no npm auth found — run 'npm login' or set NODE_AUTH_TOKEN before publishing"
  fi
  echo "  publish with: npm publish --access public --provenance   (run inside each package dir)"
  echo

  # -- VS Code Marketplace ------------------------------------------------------
  echo "${BOLD}VS Code Marketplace${RESET} — already live"
  if command -v vsce >/dev/null 2>&1 || npx --no-install vsce --version >/dev/null 2>&1; then
    ok "vsce CLI available"
  else
    warn "vsce not installed — npm install -g @vscode/vsce"
  fi
  if [ -n "${VSCE_PAT:-}" ]; then
    ok "VSCE_PAT found in environment"
  else
    warn "VSCE_PAT not set — needed to run 'vsce publish' outside CI"
  fi
  echo "  publish with: vsce publish --packagePath <vsix>"
  echo

  # -- Open VSX Registry ---------------------------------------------------------
  echo "${BOLD}Open VSX Registry${RESET} (open-vsx.org) — ${YELLOW}not yet published, no rebuild needed${RESET}"
  echo "${DIM}  Feeds Cursor, Windsurf, VSCodium, Gitpod, code-server, Theia — same .vsix you already build.${RESET}"
  if command -v ovsx >/dev/null 2>&1 || npx --no-install ovsx --version >/dev/null 2>&1; then
    ok "ovsx CLI available"
  else
    warn "ovsx not installed — npm install -g ovsx (or use npx ovsx)"
  fi
  if [ -n "${OVSX_PAT:-}" ]; then
    ok "OVSX_PAT found in environment"
  else
    warn "OVSX_PAT not set — create an Eclipse/open-vsx.org account, generate a token, then:"
    echo "        npx ovsx create-namespace sigtrace -p <token>   (one-time)"
  fi
  echo "  publish with: npx ovsx publish packages/extension/sigtrace-devtools-${VERSION}.vsix -p \$OVSX_PAT"
  echo

  # -- JetBrains Marketplace -----------------------------------------------------
  echo "${BOLD}JetBrains Marketplace${RESET} — ${RED}blocked, needs a fix before resubmitting${RESET}"
  echo "${DIM}  build.gradle.kts sets intellij.type = \"IU\" (IntelliJ Ultimate) and depends on the${RESET}"
  echo "${DIM}  bundled \"JavaScript\" plugin, but plugin.xml never declares WebStorm/other IDEs as${RESET}"
  echo "${DIM}  compatible targets. That mismatch between what the build targets (Ultimate-only)${RESET}"
  echo "${DIM}  and what the docs/README promise (WebStorm, IntelliJ) is the most likely cause of${RESET}"
  echo "${DIM}  the rejection — see JetBrains' own guidance on targeting multiple IDEs from a${RESET}"
  echo "${DIM}  single Ultimate-based build. Worth fixing before resubmitting rather than retrying as-is.${RESET}"
  if [ -n "${JETBRAINS_MARKETPLACE_TOKEN:-}" ] || [ -n "${PUBLISH_TOKEN:-}" ]; then
    ok "a marketplace publish token was found in environment"
  else
    warn "no JetBrains Marketplace token set (PUBLISH_TOKEN) — needed for the Gradle publishPlugin task"
  fi
  echo "  publish with: (cd packages/jetbrains-plugin && ./gradlew publishPlugin)   — only after the compatibility fix above"
  echo

  # -- GitHub Releases -------------------------------------------------------------
  echo "${BOLD}GitHub Releases${RESET} — already automated in .github/workflows/release.yml"
  if command -v gh >/dev/null 2>&1; then
    if gh auth status >/dev/null 2>&1; then
      ok "gh CLI authenticated"
    else
      warn "gh CLI installed but not authenticated — run 'gh auth login'"
    fi
  else
    warn "gh CLI not installed (only needed for manual releases outside CI)"
  fi
  echo

  hr
  echo "${BOLD}Summary${RESET}"
  echo "  Live today   : npm, VS Code Marketplace, GitHub Releases"
  echo "  Ready to add : Open VSX Registry — same .vsix, just needs a namespace + token, no code change"
  echo "  Needs a fix  : JetBrains Marketplace — resolve the IU/WebStorm compatibility declaration first"
fi
