# CookieGuard

[![Mozilla Add-on](https://img.shields.io/amo/v/cookieguard?label=Firefox%20Add-on)](https://addons.mozilla.org/en-US/firefox/addon/cookieguard/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange.svg)](src/manifest.json)
[![Privacy](https://img.shields.io/badge/Telemetry-None-success.svg)](PRIVACY.md)

**Zero-Trust Cookie Visibility. Local-Only Architecture.**

CookieGuard is an open-source Firefox extension that gives you real-time, transparent visibility into cookie activity and web tracking. Unlike blockers that silently change browser behavior, CookieGuard is built around **user sovereignty**: it classifies risk, exposes hidden activity, and lets you act on it — all from a local audit log that never leaves your device.

[**Install from Firefox Add-ons →**](https://addons.mozilla.org/en-US/firefox/addon/cookieguard/)

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [How It Works](#how-it-works)
- [Privacy & Architecture](#privacy--architecture)
- [Permissions Rationale](#permissions-rationale)
- [Contributing](#contributing)
- [License](#license)

## Features

### Real-Time Activity Feed
Event-driven architecture built on the `browser.cookies` API surfaces cookie activity the moment it happens — no polling, no delay.

### Heuristic Risk Classification
Every cookie is scored **High / Medium / Low** based on local heuristics: first-party vs. third-party origin, partitioning status, and pattern matching against known tracking and analytics signatures (e.g. `_ga`, `_fbp`, `doubleclick`, `hotjar`).

### Rules: Mute & Block Domains
Take action directly from a cookie's details:
- **Mute** a domain to silence its alerts and exclude it from the active feed.
- **Block** a domain to immediately purge its cookies and prevent new ones from being set — per browser container/identity.

### Circuit Breaker Protection
Automatically detects domains that trigger rapid set/delete loops ("event churning") and temporarily mutes them, preventing CPU starvation and a flooded activity feed.

### Local History & Export
Retains a rotating log of the last 5,000 cookie events for audit, with one-click export (with or without raw cookie values) for your own records.

### Multi-Container & Incognito Aware
Rules and history respect Firefox's contextual containers. Private window monitoring is opt-in and operates strictly **RAM-only** — nothing from a private session is ever persisted.

### Theming
Auto, Light, and Dark themes that follow your system preference or your choice.

## Installation

### From the Firefox Add-ons store (recommended)
Install the signed, reviewed build directly from [addons.mozilla.org](https://addons.mozilla.org/en-US/firefox/addon/cookieguard/).

### Manual / Development build
1. Clone this repository:
   ```sh
   git clone https://github.com/TheJaydenProject/CookieGuard.git
   ```
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on** and select `src/manifest.json`.
4. CookieGuard will appear in your toolbar for the duration of the session.

## How It Works

CookieGuard runs as a Manifest V3 background service worker that listens to `cookies.onChanged` events. Each event is:

1. **Classified** by [`classifier.js`](src/background/classifier.js) using first/third-party context, partition state, and keyword heuristics.
2. **Deduplicated & hashed** (SHA-256) to keep the UI efficient without storing redundant entries.
3. **Persisted** to `browser.storage.local` in batches (via `alarms`) to minimize I/O and battery impact.
4. **Surfaced** in the popup's **Active**, **History**, and **Rules** tabs, with optional desktop notifications for high-risk events.

If you choose to mute or block a domain, that decision is enforced live — blocked domains have their cookies removed and re-blocked on arrival, even while the circuit breaker is active.

## Privacy & Architecture

CookieGuard is built on a **Local-Only** philosophy. It does not collect telemetry, analytics, or user data — see the full [Privacy Policy](PRIVACY.md).

### Data Handling

* **Storage:** All data is persisted exclusively in `browser.storage.local` / `browser.storage.session`. No external servers are used.
* **Identity Hashing:** Cookie identities are hashed (SHA-256) locally to prevent UI duplication and ensure efficient memory usage.
* **Sanitization:** Input values are sanitized and truncated before processing to prevent Regular Expression Denial of Service (ReDoS).
* **Incognito:** Private window data, when enabled, is held in `storage.session` only and is never written to disk.

## Permissions Rationale

| Permission | Why CookieGuard needs it |
| --- | --- |
| `cookies` | Monitor `onChanged` events and read cookie attributes for classification, muting, and blocking. |
| `storage` | Persist user settings, mute/block rules, and the local history log. |
| `tabs` | Open the onboarding/setup page on first install. |
| `notifications` | Alert you to high-risk tracking events in real time. |
| `alarms` | Batch storage writes to optimize I/O performance and battery life. |
| `host_permissions` (`<all_urls>`) | Required to detect and act on cookies across all domains you visit. |

## Contributing

Issues and pull requests are welcome. If you're proposing a new heuristic, classification rule, or feature, please open an issue first to discuss the approach — especially anything that touches the privacy model.

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.
