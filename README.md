# URL Shortener

## What it does

This local application accepts HTTP and HTTPS URLs and creates random, eight-character short codes. Opening a code redirects to the normalized destination. Links are stored in SQLite and can expire after 1 hour, 24 hours (the default), 7 days, 30 days, or never.

The web page uses port `5173` by default. If that port is busy, Vite prints the URL it selected. The JSON API and redirects run at `http://localhost:3000`.

## Prerequisites

- Node.js 26 must be the active `node` on `PATH`. Check with `node --version`; it must report `v26.x`.
- bun 1.3 or later

## Run

From the repository root, install and start the app:

```sh
bun install
bun run dev
```

Open the `Local` URL printed by Vite, normally `http://localhost:5173`. Stop both development processes with Ctrl+C in the terminal running `bun run dev`.

## API examples

Create a link with the default 24-hour lifetime:

```sh
curl -i -X POST http://localhost:3000/api/links \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/docs?from=readme#start"}'
```

The response includes `code`, `shortUrl`, and `expiresAt`. Use the returned code to follow the link:

```sh
curl -i http://localhost:3000/REPLACE_WITH_RETURNED_CODE
```

Create a link that never expires:

```sh
curl -i -X POST http://localhost:3000/api/links \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/long-lived","lifetime":"never"}'
```

The complete request and response rules are in the [HTTP API contract](specs/001-url-shortener/contracts/http-api.md).

## Tests and type checks

Run the tests and TypeScript checks from the repository root:

```sh
bun run test
bun run typecheck
```

Both commands run checks in `server/` and `web/`. The real full-suite run on 2026-11-20 passed: 194 server tests and 26 web tests (220 total) across 9 test files. The command exited with code 0. The table below maps each user-story acceptance criterion to tests included in that run. The detailed check record is in [docs/verification.md](docs/verification.md).

## Acceptance criteria traceability

The spec numbers scenarios as `US1-1` through `US1-5` and `US2-1` through `US2-7`. “PASS” means the named tests passed in the full-suite run above.

| AC | Test file and exact test name | Status |
| --- | --- | --- |
| US1-1 — create and show a short link | `server/tests/routes.test.ts` — `returns 201 with code, shortUrl built from the base URL, and the 8-character code`; `web/tests/App.test.tsx` — `shows the short URL as a link to itself`; `copies the short URL to the clipboard, then the button reads "Copied"` | PASS |
| US1-2 — redirect to the normalized URL | `server/tests/routes.test.ts` — `answers 302 to the normalized URL, with query string and fragment, and no-store` | PASS |
| US1-3 — repeated submissions create distinct links | `server/tests/routes.test.ts` — `gives two different codes and both redirect` | PASS |
| US1-4 — reject invalid URLs without creating a link | `server/tests/routes.test.ts` — parameterized `US1-4: invalid input is rejected and no link is created` cases (`%s gives 400`); `web/tests/App.test.tsx` — `shows the server message in an alert and no result on a 400` | PASS |
| US1-5 — an unknown code is not redirected | `server/tests/routes.test.ts` — `does not redirect for a code that was never issued`; `serves one identical 404 page for every kind of miss` | PASS |
| US2-1 — show the selected expiration | `web/tests/App.test.tsx` — `shows the expiry in the pinned format for the server expiresAt`; `shows "Never expires" when expiresAt is null` | PASS |
| US2-2 — redirect before expiration | `server/tests/expiration.test.ts` — `redirects one second before expiry, then 404 at expiry and 1 ms after` | PASS |
| US2-3 — return the same 404 at or after expiration | `server/tests/expiration.test.ts` — `redirects one second before expiry, then 404 at expiry and 1 ms after`; `an expired link answers exactly like an unknown code` | PASS |
| US2-4 — an earlier visit does not keep a link active | `server/tests/expiration.test.ts` — `US2-4: a visit before expiry gets 302 with no-store, a visit after expiry gets 404` | PASS |
| US2-5 — reject unsupported lifetimes | `server/tests/expiration.test.ts` — parameterized `HTTP: invalid lifetimes` test, `answers %s with 400 INVALID_LIFETIME and stores nothing` | PASS |
| US2-6 — default to 24 hours | `server/tests/expiration.test.ts` — `HTTP: expiresAt from the lifetime` / `defaults to 24 hours when lifetime is omitted` | PASS |
| US2-7 — never-expiring links keep working | `server/tests/expiration.test.ts` — `never gives expiresAt null`; `a never link still redirects 100 years later`; `web/tests/App.test.tsx` — `shows "Never expires" when expiresAt is null` | PASS |
| SC-001 — first-time creator completes the flow in under 30 seconds without instructions | No automated test establishes this usability measure. | UNVERIFIED — a first-time user must test it. |

## Repository structure

```text
server/src/                 Fastify API, URL rules, SQLite storage
server/tests/               API, service, storage, startup, and expiry tests
web/src/                    React interface and API client
web/tests/                  Interface tests
specs/001-url-shortener/    Feature spec, plan, tasks, contracts, and research
docs/                       Verification record
PROCESS.md                  Development method and review record
ai-session/                 Index for session-related records
.specify/memory/constitution.md
                            Project constraints and quality gates
```

## Project records

- [Feature specification](specs/001-url-shortener/spec.md)
- [Plan](specs/001-url-shortener/plan.md) and [task list](specs/001-url-shortener/tasks.md)
- [Research and decision record](specs/001-url-shortener/research.md)
- [API contract](specs/001-url-shortener/contracts/http-api.md) and [web UI contract](specs/001-url-shortener/contracts/web-ui.md)
- [Quickstart and manual checks](specs/001-url-shortener/quickstart.md)
- [Verification commands and outputs](docs/verification.md)
- [Process and review record](PROCESS.md)
- [AI session records index](ai-session/README.md)
- [Project constitution](.specify/memory/constitution.md)

There is no separate `docs/adr/` directory. The project constitution says that decisions with alternatives are recorded in the feature's `research.md`; the link above is the canonical decision record.

## Assumptions

- The service runs locally and does not require sign-in.
- The service's system clock determines expiration.
- The configured base URL matches the address where the server is reachable.

## Out of scope

- Public hosting, deployment, accounts, and rate limiting.
- Abuse review, link removal, and destination safety checks.
- Changing a link's lifetime or destination after creation.
