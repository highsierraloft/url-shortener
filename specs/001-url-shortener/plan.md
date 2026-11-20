# Implementation Plan: URL Shortener

**Branch**: none; all work happens directly on `main` (CLAUDE.md) | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-url-shortener/spec.md`

## Summary

**What it does**: anyone can shorten an `http` or `https` URL without signing in, and choose a
lifetime: 1 hour, 24 hours (the default), 7 days, 30 days, or never. Opening the short link sends the
visitor to the original URL with a temporary redirect, until the link expires. After that, the link
returns the same 404 as a code that never existed.

**How it's built**: a Fastify server written in TypeScript that Node runs directly, with no build step.
It has three layers (routes → service → repository) over a single SQLite file, using Node's built-in
`node:sqlite`. The clock and the code generator are passed into the service, so tests can check expiry
and code collisions without waiting. A one-page React and Vite UI calls the same JSON API through
Vite's dev proxy. [research.md](./research.md) records every decision and the alternatives that were
rejected.

## Technical Context

**Language/Version**:
- TypeScript 7.0, used for type-checking only (`tsc --noEmit`).
- Node.js 26 (verified on 26.0.0). The server's `.ts` files run directly through Node's type stripping
  (research R1).

**Primary Dependencies**:
- `server/`: Fastify 5.12.
- `web/`: React 19.3, Vite 8.3, `@vitejs/plugin-react` 6.3.
- Development only: Vitest 5.1, `@testing-library/react` 16.3, `@testing-library/user-event`, jsdom 31,
  `@types/node`, `@types/react`, `@types/react-dom`.
- There are no other runtime dependencies.

**Storage**: a SQLite file through `node:sqlite` (research R3, R12). The default path is
`server/data/links.db`. Tests use `:memory:` and temporary files.

**Testing**: Vitest (`vitest run`) in each package. Server HTTP tests use `fastify.inject()`. Web tests
use Testing Library on jsdom (research R15).

**Target Platform**: a local machine (macOS or Linux). The server listens on `localhost:3000`, which
covers both loopback addresses, 127.0.0.1 and ::1. The UI dev server runs on `localhost:5173`.

**Project Type**: web application, as bun workspaces:
- `server/`: the JSON API and redirects
- `web/`: the one-page UI

**Performance Goals**: SC-007. 95% of redirects are answered in under 0.5 s when run locally. This is
a manual check ([quickstart.md](./quickstart.md)).

**Constraints**:
- bun only, for installing and running scripts.
- No external services.
- Runs locally only, as a single process (A-11, A-17).
- No build step.
- Tests run once and exit.

**Scale/Scope**: up to about 100,000 links and a handful of people using it at once (A-14). That means
2 HTTP endpoints, 1 table and 1 page.

There are no open questions: Phase 0 resolved the TypeScript runtime (R1) and the SQLite driver (R3).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Simplicity First | PASS | 2 packages, 3 server layers, 1 table, 2 endpoints, and one runtime dependency per package (Fastify; React). Scale concerns stay documented in the spec's "What Changes at Scale" section. |
| II. Test-First | PASS | The clock and code generator are injected (R5, R6). Every acceptance scenario maps to a test (see "Requirement coverage"). Tasks will put each test before its code. |
| III. Spec Is the Single Source of Truth | PASS | Every endpoint, field and status code traces to a functional requirement (see "Requirement coverage"). |
| IV. Tests Are Never Edited to Pass | PASS (process) | Applies during implementation. |
| V. Decisions Are Recorded in research.md | PASS | Every decision with real alternatives is in [research.md](./research.md) (R1–R15), each with its rejected options and reasons. |
| VI. Clear Process Ownership | PASS | Spec Kit produced this plan, and Superpowers will run execution. There are no worktrees, branches or PRs; all work goes on `main`. |
| VII. Verification Before Completion | PASS | [quickstart.md](./quickstart.md) defines the run-and-check steps, including the restart check and refusing to start without writable storage. |
| Technical Constraints | PASS | Node.js and TypeScript, React, bun only, local only, no external services (SQLite is a local file), `vitest run`. |

Some choices are made at plan level, inside the room the spec leaves:

| Choice | Why it's within the spec |
|--------|--------------------------|
| `Cache-Control: no-store` on redirects | Implements the outcome FR-010 states (R10) |
| A 16 KiB request size limit | The spec leaves request size to the plan (R11) |
| Exactly 8 case-sensitive characters per code | Within FR-006 (R6) |
| The error codes and messages | Implement FR-002 and SC-004 |

**Gate result**: pass, against constitution v2.0.0 (amended 2026-11-20).

## Requirement coverage

All paths below are relative to `server/` or `web/`. Story scenarios are written as US1-n and US2-n.

| Requirements | Implemented in | Tested by |
|--------------|----------------|-----------|
| FR-001, FR-005, FR-007 | `routes.ts` (`POST /api/links`) → `link-service.ts` `create` | `routes.test.ts`: US1-1, US1-3 |
| FR-002, FR-019 | `link-service.ts` (validation and normalization) | `link-service.test.ts`: every rule and message; `routes.test.ts`: US1-2, US1-4 |
| FR-003, FR-004, FR-006 | `link-service.ts` (generator and retry), `link-repository.ts` (primary key) | `link-service.test.ts`: code format, forced collision, every attempt colliding; `link-repository.test.ts`: duplicate key |
| FR-008, FR-009, FR-010, FR-013 | `routes.ts` (`GET /:code`, not-found handler) → `link-service.ts` `resolve` | `routes.test.ts`: US1-2, US1-5, US2-2, US2-3, US2-4 (fake clock at T−1 s, T, T+1 ms; `no-store`; identical 404 bodies) |
| FR-011, FR-012 | `link-service.ts` (lifetime table, `expiresAt`) | `link-service.test.ts`, `routes.test.ts`: US2-1, US2-5, US2-6, US2-7 |
| FR-014 | `App.tsx` (formats the server's `expiresAt`) | `App.test.tsx` |
| FR-015 | No update or delete path exists; the repository only offers `insert` and `findByCode` | by construction |
| FR-016 | No authentication anywhere | `routes.test.ts`: every request is sent without credentials |
| FR-017 | `link-repository.ts` (file database) | `link-repository.test.ts`: create, close, reopen |
| FR-018 | [contracts/http-api.md](./contracts/http-api.md); `api.ts` in `web/` calls the same endpoint | `App.test.tsx`: the request's shape |
| FR-020 | `config.ts` (`BASE_URL`) → `shortUrl` | `config.test.ts`, `routes.test.ts` |
| FR-021 | `link-service.ts` (returns only after `insert` succeeds), error handler (`STORAGE_ERROR`) | `link-service.test.ts`, `routes.test.ts`: failing insert means no `shortUrl` |
| FR-022 | `link-repository.ts` (startup write check), `main.ts` (exit code 1) | `link-repository.test.ts`: write-protected file, read-only folder |
| SC-001, SC-007 | none | Manual ([quickstart.md](./quickstart.md)) |

## Project Structure

### Documentation (this feature)

```text
specs/001-url-shortener/
├── spec.md              # Requirements (approved at gate 1, 2026-11-20)
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R15, with rejected alternatives
├── data-model.md        # Phase 1: links table, lifetimes, validation order, states
├── quickstart.md        # Phase 1: run and validation guide
├── contracts/
│   ├── http-api.md      # Phase 1: POST /api/links, GET /{code}
│   └── web-ui.md        # Phase 1: one-page UI elements and states
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
package.json                 # bun workspaces ["server", "web"]; test, typecheck and dev run in both via --filter
bun.lock

server/
├── package.json             # dev: node --watch src/main.ts | start: node src/main.ts
│                            # test: vitest run | typecheck: tsc --noEmit
├── tsconfig.json            # strict, nodenext, noEmit, allowImportingTsExtensions,
│                            # erasableSyntaxOnly, verbatimModuleSyntax, types: ["node"]
├── vitest.config.ts
├── src/
│   ├── main.ts              # Wiring: config → repository → service → app.listen; exit 1 on startup errors
│   ├── config.ts            # PORT, BASE_URL, DB_PATH: defaults and validation (FR-020)
│   ├── app.ts               # buildApp({ service }): Fastify, bodyLimit, error and not-found handlers
│   ├── routes.ts            # Layer 1: POST /api/links, GET /:code
│   ├── link-service.ts      # Layer 2: validation, normalization, lifetimes, expiry, code generation and retry;
│   │                        #          Clock and CodeGenerator types and their production versions
│   └── link-repository.ts   # Layer 3: open and check storage, schema, insert, findByCode
└── tests/
    ├── config.test.ts
    ├── link-service.test.ts
    ├── link-repository.test.ts
    └── routes.test.ts       # HTTP acceptance tests for Stories 1 and 2, through app.inject()

web/
├── package.json             # dev: vite | test: vitest run | typecheck: tsc --noEmit
├── tsconfig.json
├── vite.config.ts           # React plugin, /api proxy to localhost:3000, Vitest on jsdom with TZ=UTC
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx              # The one page: form, result, errors
│   └── api.ts               # createLink(url, lifetime) → POST /api/links
└── tests/
    └── App.test.tsx
```

**Structure Decision**: a web application split into two bun workspace packages, as the human
directed. The server has exactly three layers: `routes.ts`, `link-service.ts` and
`link-repository.ts`. The other server files are not layers:

- `main.ts` wires the parts together.
- `config.ts` reads the environment.
- `app.ts` holds the Fastify setup.

The UI is one component plus a small API helper. There are no shared packages: the API contract is
small enough that each side states its own types.

## Complexity Tracking

None. Constitution v2.0.0 resolved the earlier worktree deviation (VI).

## Post-design Constitution Check

This was re-checked after writing [data-model.md](./data-model.md), [contracts/](./contracts/) and
[quickstart.md](./quickstart.md). The design added no dependencies, layers, tables or endpoints beyond
those in the coverage table. The result is unchanged: pass.

## Before gate 2 (plan, research and tasks approved)

1. Settle the redirect status code: 302 (as planned, research R10) or 301.
2. Run `/speckit-tasks`.
