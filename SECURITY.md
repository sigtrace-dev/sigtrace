# Security Policy

## Supported Versions

We actively maintain and patch security vulnerabilities for the following versions of SigTrace:

| Version | Supported          |
|---------|--------------------|
| 1.1.x   | ✅ Yes             |
| 1.0.x   | ⚠️  Critical fixes only |
| < 1.0   | ❌ No              |

We strongly recommend always running the latest `1.1.x` release to receive all security patches and improvements.

---

## Reporting a Vulnerability

We take security vulnerabilities in SigTrace seriously. If you discover a security issue, please follow our responsible disclosure process below.

### 🔒 Please Do NOT

- Open a public GitHub issue for security vulnerabilities
- Disclose the vulnerability on social media, Discord, or any public forum before a fix is available
- Attempt to exploit the vulnerability against production systems or other users

### ✅ How to Report

Please report security vulnerabilities privately using GitHub's secure reporting tool:

👉 **[Report Vulnerability Privately on GitHub](https://github.com/sigtrace-dev/sigtrace/security/advisories/new)**

Include the following information in your report:

1. **Description** – A clear and concise description of the vulnerability
2. **Affected component** – Which package is affected (`@sigtrace/core`, `@sigtrace/vite-plugin`, the VS Code extension, or the WebSocket server)
3. **Affected versions** – The version(s) you confirmed are impacted
4. **Steps to reproduce** – A minimal, reproducible example or proof-of-concept (PoC)
5. **Potential impact** – Your assessment of the severity and potential attack scenarios
6. **Suggested fix** – (Optional) If you have a proposed fix or patch, please include it

---

## Disclosure Timeline

Once we receive your report, we commit to the following process:

| Milestone                                  | Target Timeframe     |
|--------------------------------------------|----------------------|
| Acknowledgement of report receipt          | Within **48 hours**  |
| Triage and initial assessment              | Within **5 days**    |
| Confirmation of vulnerability and severity | Within **10 days**   |
| Patch development and testing              | Within **30 days**   |
| Coordinated public disclosure              | After patch is released |

We will keep you informed at each stage and coordinate the public disclosure date with you. We credit all valid security reporters in our release notes unless you prefer to remain anonymous.

---

## Severity Assessment

We use the [CVSS v3.1](https://www.first.org/cvss/calculator/3.1) scoring system to assess severity:

| CVSS Score | Severity |
|------------|----------|
| 9.0 – 10.0 | Critical |
| 7.0 – 8.9  | High     |
| 4.0 – 6.9  | Medium   |
| 0.1 – 3.9  | Low      |

Critical and High severity issues will be prioritized for immediate patching with out-of-cycle releases.

---

## Security Considerations for SigTrace Users

SigTrace instruments your application's signal graph at build time and streams telemetry over a local WebSocket connection. Keep the following in mind:

- **Development only**: The SigTrace WebSocket server (`@sigtrace/core`) is designed for local development use only. **Never expose port `7337` (or your configured port) to public networks.**
- **No data exfiltration**: SigTrace does not send any data to external servers. All telemetry stays on `localhost`.
- **Build artifacts**: Instrumentation code injected by `@sigtrace/vite-plugin` is only added in development mode. Production builds are unaffected.

---

## Bug Bounty

SigTrace does not currently operate a formal bug bounty program. However, we deeply value the security research community and will publicly acknowledge all valid reporters in our changelogs and security advisories.

---

## Contact

| Purpose              | Contact Channel                                               |
|----------------------|---------------------------------------------------------------|
| Security reports     | [GitHub Private Security Reports](https://github.com/sigtrace-dev/sigtrace/security/advisories/new) |
| Code of conduct      | [GitHub Private Security Reports](https://github.com/sigtrace-dev/sigtrace/security/advisories/new) |
| General inquiries    | [GitHub Discussions](https://github.com/sigtrace-dev/sigtrace/discussions) |
