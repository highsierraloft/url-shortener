---

description: "Task list for the URL shortener (10 tasks, test-first, one subagent per task)"
---

# Tasks: URL Shortener

**Input**: Design documents from `specs/001-url-shortener/`

**Prerequisites**:
- [plan.md](./plan.md)
- [spec.md](./spec.md)
- [research.md](./research.md)
- [data-model.md](./data-model.md)
- [contracts/](./contracts/)
- [quickstart.md](./quickstart.md)

**Tests**: required. The human asked for TDD with `superpowers:test-driven-development`, and
constitution II requires it. Every test is written and seen failing before its code exists.

**Status**: gate 2 approved on 2026-11-20, including T001's placeholder modules.

**Organization**: the tasks run in this order:
1. Scaffold
2. All failing tests (the RED step)
3. **Gate 3**: the human reviews the failing tests
4. Implementation (the GREEN step), one user story at a time
5. Verification

This order follows constitution gate 3: failing tests are reviewed before any implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel, because the task touches different files and has no unfinished
  dependencies.
- **[Story]**: the user story the task belongs to: US1 (shorten and redirect) or US2 (lifetime).
- Paths are relative to the repository root.

---

## Subagent brief (applies to every task)

Each task runs in a **fresh subagent**. Its brief is the task entry, plus the rules below and the
"Module interfaces" section. A subagent needs nothing else from this conversation.

**All tasks**

- Follow `superpowers:test-driven-development`. Test tasks also follow its `writing-good-tests.md`.
- Create or modify **only the files the task lists**. If another file needs a change, stop and report.
- Use bun only. Don't add dependencies beyond those listed in T001 (plan.md, Technical Context).
- Server code must use TypeScript syntax that Node can strip without compiling (research R1). That
  means:
  - no `enum`
  - no `namespace`
  - no constructor parameter properties
  - relative imports end in `.ts`
- Don't commit. The orchestrator commits after review, once the human has approved the commit message.
- After every `.ts` or `.tsx` edit, the edit hook runs that package's typecheck and tests. Test
  failures are expected in RED tasks; read them, but don't "fix" them.
- **Report**:
  - the files you changed
  - each command you ran, with its exit code and the end of its output
  - RED or GREEN evidence (see below)
  - any deviation from the brief
  - any open questions

**RED tasks (T002–T005)**

- Write tests only. Never edit `src/`: T001 owns the placeholder modules.
- `bun run typecheck` in the package **must pass**.
- Every new test **must fail**, either on an assertion or on a placeholder's `Not implemented` error.
  A test that fails because of an import, syntax or type error doesn't count.
- Assert the specific error class, code and message. Never use a bare `toThrow()`: the placeholder's
  `Not implemented` error would make it pass.
- Report every test by name, with its failure reason.

**GREEN tasks (T006–T009)**

- First run the task's tests and confirm they fail.
- Write the minimum code that makes them pass.
- **Never edit a test file** (constitution IV). If a test looks wrong, stop and report.
- Finish with root `bun run test` and `bun run typecheck`. Report every test that still fails, by
  name, with the task that owns it.

---

## Module interfaces

T001 creates these exact exports. Everything that has behavior throws `new Error('Not implemented')`
until its GREEN task. Interfaces, types, error classes and test helpers are complete from the start.

```ts
// server/src/config.ts
export interface Config { port: number; baseUrl: string; dbPath: string }
export class ConfigError extends Error {}
export function loadConfig(env: Record<string, string | undefined>): Config

// server/src/link-repository.ts
export interface LinkRecord { code: string; url: string; createdAt: number; expiresAt: number | null }
export interface LinkRepository {
  insert(link: LinkRecord): void                 // DuplicateCodeError on errcode 1555, StorageError otherwise
  findByCode(code: string): LinkRecord | undefined
  close(): void
}
export class DuplicateCodeError extends Error {}
export class StorageError extends Error {}
export function openLinkRepository(dbPath: string): LinkRepository   // ':memory:' in tests

// server/src/link-service.ts
export interface Clock { now(): number }          // epoch ms
export type CodeGenerator = () => string
export type Lifetime = '1h' | '24h' | '7d' | '30d' | 'never'
export type ValidationCode = 'URL_REQUIRED' | 'INVALID_URL' | 'MISSING_SCHEME' | 'UNSUPPORTED_SCHEME'
  | 'URL_TOO_LONG' | 'INVALID_LIFETIME' | 'INVALID_REQUEST'
export class ValidationError extends Error {
  readonly code: ValidationCode
  constructor(code: ValidationCode, message: string)
}
export interface CreatedLink { code: string; shortUrl: string; expiresAt: string | null } // ISO 8601 UTC, ms
export interface LinkService {
  create(body: unknown): CreatedLink              // throws ValidationError or StorageError
  resolve(code: string): string | null            // the stored URL if the link is active, otherwise null
}
export const systemClock: Clock
export const generateCode: CodeGenerator
export function createLinkService(deps: {
  repository: LinkRepository; clock: Clock; generateCode: CodeGenerator; baseUrl: string
}): LinkService

// server/src/app.ts
export function buildApp(deps: { service: LinkService; logger?: boolean }): FastifyInstance
// server/src/routes.ts
export function registerRoutes(app: FastifyInstance, service: LinkService): void
// server/src/main.ts: no exports; it wires everything together and starts listening

// server/tests/helpers.ts (complete in T001; test utilities only)
export interface FakeClock extends Clock { set(ms: number): void; advance(ms: number): void }
export function fakeClock(startMs?: number): FakeClock   // default Date.parse('2026-01-01T00:00:00.000Z')
export function fixedCodes(...codes: string[]): CodeGenerator  // returns the codes in order; throws when out of codes
export function createTestApp(options?: { clock?: FakeClock; codes?: string[]; baseUrl?: string }):
  { app: FastifyInstance; clock: FakeClock; repository: LinkRepository; service: LinkService }
  // ':memory:' repository; the real generateCode unless `codes` is given; baseUrl 'http://short.test'

// web/src/api.ts
export type Lifetime = '1h' | '24h' | '7d' | '30d' | 'never'
export interface CreatedLink { code: string; shortUrl: string; expiresAt: string | null }
export type CreateLinkResult = { ok: true; link: CreatedLink } | { ok: false; message: string }
export function createLink(url: string, lifetime: Lifetime): Promise<CreateLinkResult>
  // fetch('/api/links', { method: 'POST', headers: { 'content-type': 'application/json' },
  //   body: JSON.stringify({ url, lifetime }) })
  // failure → the server's error.message; fetch rejects → "Couldn't reach the service. Try again."

// web/src/App.tsx
export function App(): React.JSX.Element | null
```

The expiry text is pinned so that the test and the implementation agree:

```ts
`Expires on ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(expiresAt))}`
```

When `expiresAt` is `null`, the text is `Never expires`.

---

## Phase 1: Setup

**Purpose**: the workspace, its configuration, and placeholder modules, so that tests compile and fail
for the right reason.

- [ ] T001 Scaffold the bun workspace with typed placeholder modules and test helpers in `package.json`, `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/src/{config,link-repository,link-service,app,routes,main}.ts`, `server/tests/helpers.ts`, `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/{main.tsx,App.tsx,api.ts}`
  - **Read**:
    - plan.md: Technical Context, Project Structure
    - research.md: R1, R2, R14
    - this file: Module interfaces
  - **Root**:
    - `"private": true` and `"workspaces": ["server", "web"]`
    - scripts `test`, `typecheck` and `dev`, each `bun run --filter '*' <script>`
  - **server/**:
    - `"type": "module"`
    - dependency: `fastify`
    - dev dependencies: `typescript`, `vitest`, `@types/node`
    - scripts:
      - `dev`: `node --watch src/main.ts`
      - `start`: `node src/main.ts`
      - `test`: `vitest run`
      - `typecheck`: `tsc --noEmit`
    - tsconfig: `strict`, `module`/`moduleResolution` `nodenext`, `noEmit`,
      `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `types: ["node"]`,
      and `include` covering `src` and `tests`
    - Vitest: `environment: 'node'`, `include: ['tests/**/*.test.ts']`, `passWithNoTests: true`
  - **web/**:
    - dependencies: `react`, `react-dom`
    - dev dependencies: `vite`, `@vitejs/plugin-react`, `vitest`, `jsdom`, `@testing-library/react`,
      `@testing-library/dom`, `@testing-library/user-event`, `@types/react`, `@types/react-dom`,
      `typescript`
    - scripts:
      - `dev`: `vite`
      - `test`: `vitest run`
      - `typecheck`: `tsc --noEmit`
    - tsconfig: `strict`, `jsx: "react-jsx"`, `moduleResolution: "bundler"`, `noEmit`, and `include`
      covering `src`, `tests` and `vite.config.ts`, so test files are type-checked too
    - `vite.config.ts`:
      - React plugin
      - `server.proxy` sends `/api` to `http://localhost:3000`
      - `test`: `environment: 'jsdom'`, `env: { TZ: 'UTC' }`, `passWithNoTests: true`, `globals: true`.
        Testing Library only cleans up the DOM after each test when Vitest's globals are on.
    - `main.tsx` renders `<App />` into `#root`, complete. The `App` placeholder returns `null`.
  - **Done when**:
    - `bun install` succeeds.
    - Root `bun run typecheck` exits with code 0.
    - Root `bun run test` exits with code 0 (there are no tests yet).
    - Only the listed files and `bun.lock` are new.

---

## Phase 2: Failing tests first (RED)

**Purpose**: every acceptance scenario as a test that fails for the right reason. All four tasks run in
parallel once T001 is done.

- [ ] T002 [P] Write failing tests for configuration, storage and startup in `server/tests/config.test.ts`, `server/tests/link-repository.test.ts`, `server/tests/startup.test.ts`
  - **Read**:
    - spec.md: FR-004, FR-017, FR-020, FR-022, A-17
    - research.md: R12, R13
    - data-model.md: "Entity: Short link"
    - quickstart.md: checks 8–9
  - **config tests**:
    - Defaults: port 3000, `http://localhost:3000`, `data/links.db`.
    - The default `BASE_URL` follows `PORT`.
    - A trailing slash is removed from `BASE_URL`.
    - `ConfigError` for:
      - `PORT` of `0`, `70000` or `abc`
      - `BASE_URL` with a non-http(s) scheme, a path, a query, a fragment, or that isn't a URL at all
  - **repository tests**:
    - All four Short link fields come back unchanged after insert and `findByCode`, including
      `expiresAt: null`.
    - An unknown code returns `undefined`.
    - Lookups are case-sensitive.
    - A duplicate code throws `DuplicateCodeError`.
    - Links in a file database survive `close` and reopening (FR-017).
    - A write-protected existing file throws `StorageError` at open (FR-022). This must hold even though
      `CREATE TABLE IF NOT EXISTS` succeeds on such a file (R12).
    - An unwritable folder throws `StorageError`.
    - A missing parent folder is created.
    - Use `mkdtemp` folders, and restore their permissions in `afterEach`.
  - **startup tests**:
    - Run `node src/main.ts` with `spawnSync` (cwd `server/`, with a timeout).
    - An invalid `BASE_URL` gives exit code 1, and stderr names `BASE_URL`.
    - A `DB_PATH` inside a read-only folder gives exit code 1, and stderr mentions storage.
    - Assert on the stderr text, not only the exit code: the placeholder also exits with 1.

- [ ] T003 [P] [US1] Write failing service and HTTP tests for shortening and redirecting in `server/tests/link-service.test.ts`, `server/tests/routes.test.ts`
  - **Read**:
    - spec.md: User Story 1, FR-001–FR-010, FR-015, FR-016, FR-019, FR-021, SC-007, Edge Cases
    - contracts/http-api.md
    - data-model.md: "Validation rules", "Code allocation", "States"
    - research.md: R6, R7, R10, R11
  - **Service tests**:
    - Every validation rule, in data-model order, with the exact code and message from the contract.
      Examples to include:
      - `"  HTTPS://Example.COM  "` is stored as `https://example.com/`
      - `https:\\example.com` and `https://exa\nmple.com` both become `https://example.com/`
      - non-ASCII text is percent-encoded
      - 2,048 normalized characters are accepted; 2,049 are rejected
      - `example.com` gives `MISSING_SCHEME`
      - `javascript:`, `ftp:` and `mailto:` give `UNSUPPORTED_SCHEME`
      - a number as the URL gives `INVALID_URL`
      - a body of `null`, an array or a string gives `INVALID_REQUEST`
    - `shortUrl` is `baseUrl + '/' + code`.
    - `generateCode` matches `^[A-Za-z0-9]{8}$`.
    - 10,000 links created with the real generator all have different codes (SC-005).
    - `fixedCodes('AAAAAAAA','AAAAAAAA','BBBBBBBB')`: the second link gets `BBBBBBBB`.
    - Five collisions in a row throw `StorageError`, and nothing is stored.
    - A failed insert (the repository was closed) throws `StorageError`.
    - The same URL twice gives two different codes, and both resolve.
    - Resolving an unknown code returns `null`.
  - **HTTP tests** (`createTestApp` + `app.inject`):
    - US1-1 to US1-5.
    - An active link returns `302` with `Location` and `Cache-Control: no-store`.
    - A query string on the short link is ignored.
    - `/zzzzzzzz`, `/abc`, `/abc12345/` and `GET /api/links` all return `404` with
      `text/html; charset=utf-8`, a body containing "Link not found", and `no-store`.
    - Every 400 response has the shape `{ error: { code, message } }`.
    - Malformed JSON gives `400 INVALID_REQUEST`.
    - A `text/plain` body gives `415 INVALID_REQUEST`.
    - A body over 16 KiB gives `413 PAYLOAD_TOO_LARGE`.
    - A storage failure gives `500 STORAGE_ERROR`, with no `shortUrl`.
    - FR-015: `PUT`, `PATCH` and `DELETE` on `/api/links/{code}` and on `/{code}` all return 404, and
      the link still redirects afterwards.
    - SC-007: 100 redirects of one link, timed per request; the 95th percentile is under 500 ms.
  - **Don't** assert anything about `lifetime` or `expiresAt`. That belongs to US2 (T005).

- [ ] T004 [P] [US1] Write failing UI tests for the one-page app in `web/tests/App.test.tsx`
  - **Read**:
    - contracts/web-ui.md
    - contracts/http-api.md (response and error shapes)
    - spec.md: FR-007, FR-014, FR-018
    - this file: Module interfaces (web), and the pinned expiry text
  - **Cover**:
    - The elements, found by their accessible names.
    - The lifetime select defaults to "24 hours".
    - Submitting sends exactly one `POST /api/links` with `{ url: <as typed, not trimmed>, lifetime }`.
    - While the request is in flight, the button is disabled and reads "Shortening…".
    - On success:
      - the `shortUrl` link is shown
      - Copy writes the link to the clipboard, then the button reads "Copied"
      - the expiry text shows the pinned format
      - the expiry text doesn't change when the client clock moves (`vi.setSystemTime`; FR-014)
      - `Never expires` appears when `expiresAt` is `null`
    - A 400 shows the server's message in `role="alert"`, and no result.
    - When `fetch` rejects, the page shows `Couldn't reach the service. Try again.`
    - A later success clears an earlier error.
  - This task also covers the UI side of US2 (the lifetime select and the expiry display).
  - Stub `fetch` with `vi.stubGlobal`. This is the only mock allowed, because there is no server in
    web tests.

- [ ] T005 [P] [US2] Write failing lifetime and expiry tests in `server/tests/expiration.test.ts`
  - **Read**:
    - spec.md: User Story 2, FR-011–FR-015, SC-003
    - contracts/http-api.md (`lifetime`, `expiresAt`, `INVALID_LIFETIME`)
    - data-model.md: "Lifetimes", "States"
    - research.md: R5, R8, R9, R10
  - **Cover**, at both service and HTTP level, using `fakeClock`:
    - No lifetime gives `expiresAt` = creation time + 86,400,000 ms, as ISO 8601 with milliseconds.
    - `1h`, `24h`, `7d` and `30d` each give exactly their duration.
    - `never` gives `expiresAt: null`, and the link still redirects after the clock moves 100 years.
    - `null`, `""`, `"2h"`, `"1H"`, `3600` and `true` each give `400 INVALID_LIFETIME` with the contract
      message, and nothing is stored.
    - Boundaries: at T − 1 s the link returns `302`; at T it returns `404`; at T + 1 ms it returns `404`.
    - An expired link's response is identical to an unknown code's: same status, content type,
      `Cache-Control` and body.
    - Milliseconds are kept: a clock at `…:00.700` gives an expiry at `…:00.700` plus the lifetime.
    - US2-4: a visit before expiry gets `302` with `no-store`; a visit after expiry gets `404`.

**Checkpoint: GATE 3.** The human reviews the failing tests before any implementation starts
(constitution, Development Workflow).

---

## Phase 3: Foundational (GREEN)

**Purpose**: configuration, storage and startup, which the server tasks for both stories depend on.

- [ ] T006 [P] Implement configuration, storage and startup in `server/src/config.ts`, `server/src/link-repository.ts`, `server/src/main.ts` until T002 passes
  - **Read**:
    - research.md: R12, R13
    - data-model.md: "Entity: Short link". The `links` table implements `data-model.md`
      `Short link.code`, `Short link.url`, `Short link.created_at` and `Short link.expires_at`, exactly
      as defined there.
  - **Storage at open**:
    1. create the parent folder
    2. open the database
    3. run `CREATE TABLE IF NOT EXISTS`
    4. run `PRAGMA user_version = 1` as a real write

    Throw `DuplicateCodeError` when an insert fails with errcode 1555. Throw `StorageError` for every
    other failure.
  - **`main.ts`**:
    - Wiring: `loadConfig(process.env)` → `openLinkRepository` →
      `createLinkService({ repository, clock: systemClock, generateCode, baseUrl })` →
      `buildApp({ service, logger: true })` → `listen({ port, host: 'localhost' })`.
    - On `ConfigError` or `StorageError`: print the message with `console.error` and exit with code 1.

---

## Phase 4: User Story 1, Shorten a URL and share it (Priority: P1) 🎯 MVP

**Goal**: create short links through the API and the page, and follow them to the original URL.

**Independent Test**: T003 and T004 pass. After `bun run dev`, quickstart checks 1, 2 and 4–6 pass.

- [ ] T007 [US1] Implement validation, code allocation, redirects and HTTP handling in `server/src/link-service.ts`, `server/src/routes.ts`, `server/src/app.ts` until T003 passes (depends on T006)
  - **Read**:
    - contracts/http-api.md
    - research.md: R6, R7, R10, R11
  - **URL validation and normalization**: follow data-model.md "Validation rules"; the stored value is
    `data-model.md` `Short link.url`.
  - **Code generation and allocation**: follow data-model.md "Code allocation"; the codes are
    `data-model.md` `Short link.code`. Use `crypto.randomInt`, with at most 5 attempts.
  - **`resolve`**.
  - **`buildApp`**:
    - `bodyLimit: 16384`
    - the routes
    - one error handler that turns every error into `{ error: { code, message } }`, mapped as in
      research R11
    - a not-found handler that serves the same 404 page as an unknown code
  - **Scope**: don't implement lifetimes or expiry (that's T009). Until then, every link is stored with
    `expiresAt: null`, and `expiresAt` is returned as `null`.

- [ ] T008 [P] [US1] Implement the one-page UI and API client in `web/src/api.ts`, `web/src/App.tsx` until T004 passes
  - **Read**:
    - contracts/web-ui.md
    - this file: Module interfaces (web), and the pinned expiry text
  - No router, state library or UI kit (research R14). Plain CSS in `web/src/App.css` is allowed if
    `App.tsx` imports it.

**Checkpoint**: US1 works end to end. Until US2 lands, every link behaves as if it never expires.

---

## Phase 5: User Story 2, Give a short link a lifetime (Priority: P2)

**Goal**: lifetimes (24 hours by default, or never) and expiry, with expired links returning the same
404 as unknown codes.

**Independent Test**: T005 passes, and T003 still passes.

- [ ] T009 [US2] Implement lifetimes and expiry in `server/src/link-service.ts` until T005 passes and T003 still passes (depends on T007)
  - **Read**:
    - data-model.md: "Lifetimes", "States"
    - research.md: R8, R9
  - `data-model.md` `Short link.created_at` is `clock.now()`.
  - `data-model.md` `Short link.expires_at` is `created_at` plus the lifetime's duration, or `null` for
    `never`. `expiresAt` is returned via `toISOString()`.
  - `resolve` returns `null` once `clock.now() >= expiresAt`.
  - Check `lifetime` after the URL rules, in data-model order: if it is absent, use `24h`; any other
    value not on the list gives `INVALID_LIFETIME`.

---

## Phase 6: Polish and verification

- [ ] T010 Verify end to end against quickstart.md and write `README.md`
  - **Read**:
    - quickstart.md
    - constitution VII
  - Run root `bun run typecheck` and `bun run test`; both must exit with code 0.
  - Start `bun run dev` in the background. Then:
    - run quickstart checks 1–6
    - follow the web UI walkthrough
    - run the SC-007 timing loop
  - Check 7 needs a stop and a restart. Check 8 needs a restart with `BASE_URL` set. Check 9 runs
    `server start` on its own. Stop every server you started before you finish, and remove
    `/tmp/ro-links`.
  - Paste each command's output into the report.
  - Write `README.md` with:
    - what the project is
    - prerequisites
    - how to install, run and test
    - links to quickstart.md and contracts/http-api.md (the API documentation, FR-018)
  - **Don't** change source or test files. If a check fails, stop and report it.

**Checkpoint: final review and GATE 4** (constitution, Development Workflow).
- A different model reviews the full diff against spec.md and the decisions in research.md.
- The human then triages each finding: fixed, or rejected with a reason.
- The decisions are logged in `PROCESS.md`.

---

## Dependencies & Execution Order

```text
T001 ─┬─ T002 ─┐
      ├─ T003 ─┤
      ├─ T004 ─┼─► GATE 3 ─┬─ T006 ─► T007 ─► T009 ─┐
      └─ T005 ─┘           └─ T008 ─────────────────┴─► T010 ─► final review ─► GATE 4
```

**Phase dependencies**:
- Setup (T001) blocks everything.
- The RED tasks (T002–T005) depend only on T001.
- Gate 3 needs all four RED tasks.

**After gate 3**:
- T006 (foundational) blocks the server work for both stories.
- T008 (UI) depends only on gate 3.

**Within the stories**:
- T007 (US1 server) needs T006.
- T009 (US2) needs T007, because both change `link-service.ts`.

**Shared files**: T007 and T009 both change `server/src/link-service.ts`, so they never run at the same
time. No other two tasks touch the same file.

## Parallel Example

```text
# After T001: four RED subagents at once
Task: "T002 Failing tests for config, storage and startup"
Task: "T003 Failing US1 service and HTTP tests"
Task: "T004 Failing UI tests"
Task: "T005 Failing US2 lifetime and expiry tests"

# After gate 3: two GREEN subagents at once
Task: "T006 Config, storage and startup"   # then T007, then T009
Task: "T008 One-page UI"
```

## Implementation Strategy

- **MVP (US1)**: T001 → T002–T005 → gate 3 → T006 → T007 + T008. At that point links can be created
  and followed, but nothing expires yet.
- **Full feature**: add T009, which brings lifetimes and expiry.
- **Done**: T010, the verification run with evidence (constitution VII).

## Notes

- **Per-task reviews**: after each task, the orchestrator runs a spec-compliance review, then a
  code-quality review (constitution, Development Workflow). Only then does it propose a commit
  message.
- **Trace back**: every test traces to a scenario or FR through plan.md's "Requirement coverage"
  table.
- **Placeholder modules**: T001's placeholders exist only so that the RED tests fail on an assertion
  instead of crashing on a missing import. They contain no behavior.
- **Process log**: the orchestrator logs human interventions and review decisions in `PROCESS.md` as
  they happen. This includes the gate 3 and gate 4 outcomes.
