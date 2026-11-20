# Contract: Web UI (one page)

The UI is a single page served by the Vite dev server (default `http://localhost:5173`). It talks only
to [`POST /api/links`](./http-api.md), through Vite's `/api` proxy (research R14). It has no routing,
no sign-in and no stored state.

## Elements

| Element | Accessible name | Details | Spec |
|---------|-----------------|---------|------|
| Text input | "Long URL" | `type="text"`, `inputMode="url"`, so the browser doesn't block input before the server can explain the problem | FR-001 |
| Select | "Expires after" | Options: 1 hour (`1h`), 24 hours (`24h`, selected by default), 7 days (`7d`), 30 days (`30d`), Never (`never`) | FR-011, FR-012 |
| Button | "Shorten" | Submits the form. While a request is in flight it is disabled and reads "Shortening…" | FR-001 |
| Result | none | Appears after a successful creation (see States) | FR-007 |
| Copy button | "Copy" | Copies `shortUrl` to the clipboard, then reads "Copied" | FR-007 |
| Error message | none (`role="alert"`) | The server's `error.message`, or a fallback message when the request fails | FR-002, SC-004 |

## States

| State | What the page shows |
|-------|---------------------|
| Idle | The form. The select is on "24 hours". |
| Submitting | The button is disabled and reads "Shortening…". |
| Success | `shortUrl` as a link, the Copy button, and either "Expires on {date and time}" or "Never expires". The time comes from the server's `expiresAt`, formatted with `Intl.DateTimeFormat` (date and time) in the viewer's time zone. The page never calculates expiry from its own clock (FR-014). Any earlier error is cleared. |
| Error (400, 413 or 500) | The error message from the server's `error.message`. No result is shown. |
| Network failure | `Couldn't reach the service. Try again.` This covers a request that fails outright. It also covers any failed response without a JSON error body (`{ "error": { "message" } }`), such as the dev proxy's empty `502` when the API is down (break pass B18). |

## Request the page sends

`POST /api/links` with `{ "url": <input text as typed>, "lifetime": <selected value> }`. The page
always sends `lifetime` explicitly. It sends the URL as typed: trimming and validation are the
server's job (FR-002, FR-019).

## Manual check (not automated)

SC-001: a first-time user turns a long URL into a copyable short link in under 30 seconds, with no
instructions. See [quickstart.md](../quickstart.md).
