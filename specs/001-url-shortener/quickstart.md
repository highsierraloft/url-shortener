# Quickstart: run and validate the URL shortener

This is a validation guide for after implementation. It shows the service works end to end
(constitution VII). The API details live in [contracts/http-api.md](./contracts/http-api.md), and the
UI details in [contracts/web-ui.md](./contracts/web-ui.md).

## Prerequisites

- Node.js 26. It is verified on 26.0.0, and the server runs `.ts` files directly (research R1).
- bun 1.3 or later. bun is used for installing and running scripts only.

## Install, test, type-check

Run these from the repository root:

```bash
bun install
bun run test        # vitest run, in server/ and web/
bun run typecheck   # tsc --noEmit, in server/ and web/
```

**Expected**: both commands exit with code 0. All expiration tests use an injected clock, so nothing
waits in real time.

## Run

```bash
bun run dev         # server on http://localhost:3000, UI on http://localhost:5173
```

Optional settings, read by the server at startup (research R13): `PORT` (default `3000`), `BASE_URL`
(default `http://localhost:<PORT>`), and `DB_PATH` (default `server/data/links.db`).

## Validation scenarios

In a second terminal, with `bun run dev` running:

| # | Check | Command | Expected | Covers |
|---|-------|---------|----------|--------|
| 1 | Create with the default lifetime | `curl -s -X POST localhost:3000/api/links -H 'content-type: application/json' -d '{"url":"  HTTPS://Example.COM/a?b=1#c  "}'` | `201`, with `code`, `shortUrl` (starting with `http://localhost:3000/`) and `expiresAt` 24 h from now | US1-1, US2-6, FR-007, FR-020 |
| 2 | Follow it | `curl -si localhost:3000/<code>` | `302`, `Location: https://example.com/a?b=1#c`, `Cache-Control: no-store` | US1-2, FR-008, FR-010, FR-019 |
| 3 | Never expires | the same as 1, with `"lifetime":"never"` | `201` with `"expiresAt": null` | US2-7 |
| 4 | Invalid input | send `{"url":"example.com"}`, then `{"url":"javascript:alert(1)"}`, then `{"url":"https://example.com","lifetime":"2h"}` | `400` each time, with codes `MISSING_SCHEME`, `UNSUPPORTED_SCHEME` and `INVALID_LIFETIME`; no link is created | US1-4, US2-5, SC-004 |
| 5 | Unknown code | `curl -si localhost:3000/zzzzzzzz` | `404` with the "Link not found" page | US1-5, FR-009 |
| 6 | Same URL twice | run check 1 twice | two different codes | US1-3, FR-005 |
| 7 | Survives a restart | stop `bun run dev`, start it again, then repeat check 2 | still `302` to the same URL | FR-017, SC-006 |
| 8 | Configured base address | `BASE_URL=http://127.0.0.1:3000 bun run dev`, then check 1 | `shortUrl` starts with `http://127.0.0.1:3000/` | FR-020 |
| 9 | Storage can't be written | `mkdir -p /tmp/ro-links && chmod 555 /tmp/ro-links && DB_PATH=/tmp/ro-links/links.db bun run --cwd server start` | the server prints why and exits with code 1; it doesn't listen | FR-022 |

Expiry (US2-2 to US2-4, SC-003) is checked by the automated tests with the injected clock, because the
shortest real lifetime is 1 hour.

## Web UI walkthrough

1. Open `http://localhost:5173`.
2. Paste a long URL, leave "Expires after" on "24 hours", and select "Shorten".
3. **Expected**: the short link appears with a Copy button, and "Expires on …" shows a time 24 hours
   from now in your local time zone.
4. Select "Copy", paste the link into a new tab, and check that it opens the original page.
5. Submit `example.com`. **Expected**: the message
   `Add https:// to the start, for example https://example.com.`
6. Choose "Never" and submit. **Expected**: "Never expires".

## Manual success criteria

- **SC-001**: hand the UI to someone who has never seen it. They should turn a long URL into a
  copyable short link in under 30 seconds, with no instructions.
- **SC-007**: with the server running and a known `<code>`, run the command below. The printed value
  (the 95th-percentile response time, in seconds) should be under `0.5`:

  ```bash
  for i in $(seq 100); do curl -s -o /dev/null -w '%{time_total}\n' localhost:3000/<code>; done \
    | sort -n | awk 'NR==95'
  ```
