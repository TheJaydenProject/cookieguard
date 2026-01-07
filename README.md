# CookieGuard

**Zero-Trust Cookie Visibility. Local-Only Architecture.**

CookieGuard is an open-source Firefox extension designed to provide real-time, transparent visibility into cookie activity and web tracking. Unlike blockers that modify browser behavior silently, CookieGuard focuses on user sovereignty: it classifies risk, exposes hidden activity, and maintains a local audit log without transmitting data to external servers.

## Core Features

* **Real-Time Monitoring:** Event-driven architecture utilizing the `browser.cookies` API to capture activity as it happens.
* **Heuristic Risk Classification:** Analyzes cookie names and parameters against local logic to flag potential Tracking, Analytics, or Third-Party Cross-Site risks.
* **Circuit Breaker Protection:** Prevents CPU starvation by detecting and temporarily muting domains that trigger rapid set/delete loops (excessive event churning).
* **Local History:** Retains a rotational log of the last 5,000 cookie events for user audit within the browser storage.
* **Incognito Support:** Optional monitoring for private windows with strict non-persistence rules (RAM-only operation).

## Privacy & Architecture

CookieGuard is built on a **Local-Only** philosophy. It does not collect telemetry, analytics, or user data.

### Data Handling

* **Storage:** All data is persisted exclusively in `browser.storage.local`. No external servers are used.
* **Identity Hashing:** Cookie identities are hashed (SHA-256) locally to prevent UI duplication and ensure efficient memory usage.
* **Sanitization:** Input values are sanitized and truncated before processing to prevent Regular Expression Denial of Service (ReDoS).

### Permissions Rationale

* `cookies`: Required to monitor `onChanged` events and analyze cookie attributes.
* `storage`: Required to persist user settings and history logs locally.
* `notifications`: Used to alert the user of high-risk tracking events in real-time.
* `alarms`: Used to batch storage writes, optimizing I/O performance and battery life.
* `host_permissions`: Necessary to detect cookies across all domains visited by the user.

## License

Distributed under the MIT License. See `LICENSE` for details.