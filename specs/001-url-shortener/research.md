# Research: URL Shortener

**Date**: 2026-11-20 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

This file records every planning decision that had real alternatives, as the human directed. Each entry
gives the decision, why it was chosen, and each rejected alternative with the reason. Claims marked
**verified** were checked on this machine (Node.js 26.0.0, bun 1.3.10, Vitest 5.1.1) with throwaway
probes in a scratch directory.

---

## R1. Runtime, and how TypeScript runs

- **Decision**: Node.js runs the server. Node runs the `.ts` files directly with its built-in type
  stripping (`node src/main.ts`, or `node --watch src/main.ts` in dev), so there is no build step. bun
  only installs packages and runs scripts. TypeScript is used for type-checking only (`tsc --noEmit`).
  Because Node only strips types, the code must use "erasable" syntax only: no enums, no namespaces,
  and `.ts` extensions in imports. The tsconfig enforces this with `erasableSyntaxOnly` and
  `allowImportingTsExtensions`.
- **Rationale**:
  - The challenge brief fixes Node.js (constitution, Technical Constraints).
  - Deployment is out of scope, so a build output would have no consumer.
  - **Verified**: Node 26 runs `.ts` files with no flag and no warning.
  - **Verified**: `bun run test` executes Vitest on Node, not Bun (Vitest reports `node-v26.0.0`),
    because bun respects the `#!/usr/bin/env node` line at the top of package binaries.
- **Alternatives rejected**:
  - *Bun as the runtime*: the brief fixes Node.js.
  - *`tsx`*: an extra dependency that does what Node now does natively.
  - *`tsc` build, then run `dist/`*: adds a compile step and an output folder for a service that is
    never deployed.

## R2. Workspace layout

- **Decision**: bun workspaces. The root `package.json` lists `server` and `web`, so there is one
  `bun install` and one lockfile. Each package defines `test`, `typecheck` and `dev` (CLAUDE.md). Root
  scripts run them in both packages with `bun run --filter '*' <script>`.
- **Rationale**:
  - The human asked for two packages.
  - The edit hook (`.claude/hooks/check.sh`) finds the nearest `package.json` above an edited file and
    runs that package's `typecheck` and `test`. So each package must have its own scripts.
- **Alternatives rejected**:
  - *Two unrelated projects*: two installs and two lockfiles, and no single command for the whole
    repo.
  - *Turborepo or Nx*: build orchestration isn't needed for two packages with no build step.
  - *One package for both*: mixes Node and browser settings and test environments, and the human asked
    for two.

## R3. SQLite driver

- **Decision**: Node's built-in `node:sqlite` module (`DatabaseSync`), which is synchronous.
- **Rationale**:
  - No dependency and no native compilation.
  - **Verified**: it loads on Node 26 without a flag or warning, and works inside a Vitest 5.1.1 test.
  - **Verified**: a duplicate primary key throws an error with `errcode 1555`
    (`SQLITE_CONSTRAINT_PRIMARYKEY`). The repository uses this to detect code collisions (R6).
  - A synchronous API keeps the repository a few lines long. There is a single process and the
    volume is small (A-14, A-17).
- **Alternatives rejected**:
  - *`better-sqlite3`*: mature, with the same synchronous style. But it is a native add-on that
    downloads or compiles a binary at install time, and bun blocks dependencies' install scripts unless
    they are explicitly trusted. That's an extra moving part for no gain.
  - *`bun:sqlite`*: only exists when Bun is the runtime (R1).
  - *`sqlite3`*: its callback-based async API adds complexity with no benefit for one process.
  - *An ORM (Drizzle, Prisma)*: there is one table and two queries.

## R4. Server structure and wiring

- **Decision**: three layers and nothing more:
  - **routes**: HTTP only. Parse the request, call the service, write the response.
  - **service**: every rule (validation, normalization, lifetimes, expiration, code generation).
  - **repository**: SQL only.

  `buildApp({ service })` creates the Fastify instance. `main.ts` is the only place where real
  dependencies are created: it reads the config, opens the repository, builds the service with the
  real clock and code generator, and starts listening. Dependencies are passed in as plain function
  arguments.
- **Rationale**:
  - The human directed this structure.
  - Each layer can be tested on its own, and nothing hides in globals.
- **Alternatives rejected**:
  - *A dependency-injection container (awilix, tsyringe)*: a framework to wire four objects.
  - *Fastify decorators or plugins to carry dependencies*: hides them inside the app instance, and
    Fastify's plugin scoping rules add complexity.
  - *Module-level singletons*: tests would need module mocking.
  - *Extra layers (controllers, DTOs, models)*: ruled out by "nothing more".

## R5. Clock

- **Decision**: `interface Clock { now(): number }`, returning epoch milliseconds, passed into the
  service. Production uses `{ now: () => Date.now() }`. Tests use a fake clock whose time they set
  directly.
- **Rationale**:
  - Constitution II and the human require an injected clock.
  - Tests can check the exact boundaries (one second before expiry, at expiry, one millisecond after)
    without waiting (SC-003).
- **Alternatives rejected**:
  - *Vitest fake timers (`vi.setSystemTime`)*: patches the global `Date` and timers for everything,
    including Fastify's internals, and the dependency stays implicit.
  - *A clock that returns `Date` objects*: they are mutable and invite local-time arithmetic, and
    storage needs numbers anyway (R9).

## R6. Short codes

- **Decision**:
  - Codes are exactly 8 characters from `A–Z`, `a–z` and `0–9` (62 symbols). Each character comes
    from `crypto.randomInt(62)`.
  - Codes are case-sensitive.
  - The generator is passed into the service as a `() => string` function.
  - Uniqueness comes from the database's primary key. On a duplicate (`errcode 1555`), the service
    tries a new code, up to 5 attempts in total. After that it fails with `STORAGE_ERROR`, and no link
    is shown (FR-021).
- **Rationale**:
  - FR-006 allows at most 8 characters. Using exactly 8 keeps 62^8 ≈ 2.2×10^14 possible codes, so
    guessing is impractical. This matches the figure in the spec's "What Changes at Scale" section.
  - `crypto.randomInt` is cryptographically random and unbiased.
  - **Verified**: SQLite's default text comparison is case-sensitive. Looking up `ab3de9xq` does not
    find `aB3dE9xQ`.
  - Injecting the generator lets a test force a collision. This closes the spec's SC-005 test gap.
  - **No clash with the app's own addresses** (the bug part of D3): `GET /:code` only treats paths
    matching `^[A-Za-z0-9]{8}$` as codes. Every other server address sits under `/api/`, which has a
    slash in it. So no generated code can equal an app address, and no list of reserved words is
    needed.
- **Alternatives rejected**:
  - *`nanoid` with a custom alphabet*: a dependency for about five lines of code.
  - *An auto-incrementing ID encoded in base 62*: sequential, which violates FR-006.
  - *A hash of the URL*: the same URL would always get the same code (violates FR-005), and shortened
    hashes collide.
  - *UUIDs or random hex*: either too long (FR-006) or a smaller alphabet.
  - *Case-insensitive codes*: only 36^8 ≈ 2.8×10^12 codes, plus normalization code. D3 was not adopted,
    so the simpler case-sensitive option stays.

## R7. URL validation and normalization

- **Decision**: parse URLs with the WHATWG `URL` class, which is built into Node and follows the same
  standard as browsers (FR-002). The service checks the input in this order:
  1. Missing, empty, or only whitespace → `URL_REQUIRED`.
  2. Not a string → `INVALID_URL`.
  3. `new URL(input)` throws:
     - if `new URL('https://' + input)` would parse → `MISSING_SCHEME`, with a hint to add `https://`
     - otherwise → `INVALID_URL`
  4. The protocol is not `http:` or `https:` → `UNSUPPORTED_SCHEME`.
  5. `href.length > 2048` → `URL_TOO_LONG`.
  6. Otherwise, store `href` (FR-019).

  URLs that contain a user name or password are accepted, because D9 was not adopted.
- **Rationale**:
  - Using the browsers' own parser removes any difference between what the service checks and what
    the visitor's browser does (D1).
  - **Verified**: `href` is always ASCII:
    - `  HTTPS://Example.COM/パス?q=日本#frag ` becomes
      `https://example.com/%E3%83%91%E3%82%B9?q=%E6%97%A5%E6%9C%AC#frag`
    - `https:\\example.com` and `https://exa<line break>mple.com` both become `https://example.com/`
  - Since `href` is ASCII, its length in characters equals its length in bytes (D2).
  - `http` and `https` URLs can't parse without a host, so "has a host" (FR-002) needs no separate
    check.
- **Alternatives rejected**:
  - *A regular expression*: can't reproduce browser parsing (D1).
  - *`validator.js` `isURL`, or RFC 3986 parsers such as `uri-js`*: they follow different rules from
    browsers, which is exactly the mismatch D1 removed.
  - *Storing the raw input*: the D1 defect.
- **Known quirk**: `localhost:3000` parses as a URL whose scheme is `localhost:`. It gets
  `UNSUPPORTED_SCHEME` instead of the missing-scheme hint. This is accepted.

## R8. Lifetime in the API

- **Decision**:
  - `lifetime` is an optional string field: `"1h"`, `"24h"`, `"7d"`, `"30d"` or `"never"`.
  - If the field is absent, the lifetime is `"24h"`.
  - Any other value is rejected with `INVALID_LIFETIME`, and the message lists the allowed values.
    That includes `null`, `""`, `"2h"` and `3600`.
  - The durations are fixed constants in milliseconds: 3,600,000; 86,400,000; 604,800,000; and
    2,592,000,000.
- **Rationale**: this implements FR-011, FR-012 and D7. The values are readable, and the durations are
  exact (D6).
- **Alternatives rejected**:
  - *A number of seconds, with `null` meaning never*: `null` becomes ambiguous again (the D7 problem).
  - *ISO 8601 durations (`PT1H`, `P7D`)*: most libraries treat `P7D` as calendar days (D6), and the
    format is unfamiliar.
  - *The client sends the expiry moment*: this depends on the client's clock (FR-014, D6) and would
    allow any value.

## R9. How times are stored and checked

- **Decision**:
  - The `created_at` and `expires_at` columns hold whole numbers: milliseconds since the Unix epoch,
    in UTC. A `NULL` `expires_at` means the link never expires.
  - The service decides expiry: a link is expired when `expiresAt !== null && clock.now() >= expiresAt`.
  - The API returns `expiresAt` as an ISO 8601 UTC string with milliseconds. The web page formats it
    in the viewer's time zone.
- **Rationale**: this implements FR-013 (millisecond precision, no rounding, the service's clock) and
  FR-014 (one absolute moment). Whole numbers compare exactly, and no time zone ever reaches storage.
- **Alternatives rejected**:
  - *ISO 8601 text columns*: only sort correctly if every value uses the same format and offset.
  - *SQLite's `datetime('now')`*: second precision, and it uses the database's clock instead of the
    injected one.
  - *Filtering out expired links in SQL*: splits the expiry rule across two layers. Keeping it in the
    service leaves the repository SQL-only.

## R10. Redirect and "not found" responses

- **Decision**:
  - **Active link**: `302 Found`, with `Location` set to the stored `href` and
    `Cache-Control: no-store`.
  - **Unknown, expired, or malformed code, and any address the server doesn't know**: `404`, with
    `Content-Type: text/html; charset=utf-8`, the same small fixed "Link not found" page, and
    `Cache-Control: no-store`.
  - A query string added to a short link is ignored.
- **Rationale**:
  - FR-010 requires temporary redirects. FR-009 and FR-013 require identical 404s.
  - `no-store` makes Story 2 scenario 4 hold: an expired link stops working even for visitors who used
    it before. This implements the outcome FR-010 states. D8, which would have added this rule to the
    spec text, was not adopted, so this is a plan-level choice that the human can veto.
- **Alternatives rejected**:
  - *301 or 308 permanent redirects*: browsers cache them, which violates FR-010.
  - *307*: behaves the same as 302 for GET requests, and 302 is the most widely understood.
  - *410 Gone for expired links*: violates FR-013.
  - *Redirecting to a "not found" page in the UI*: FR-013 requires a 404 status code.
  - *A JSON 404 body*: visitors are browsers.

## R11. Request validation and error format

- **Decision**:
  - The route passes the parsed JSON body to the service. The service validates it with plain
    TypeScript and throws a typed `ValidationError(code, message)`.
  - A single Fastify error handler turns errors into responses:

    | Error | Status | Code |
    |-------|--------|------|
    | `ValidationError` | 400 | its own code |
    | Fastify's own client errors (malformed JSON, wrong content type, body that isn't an object) | the status Fastify gives (400 or 415) | `INVALID_REQUEST` |
    | Body over the limit | 413 | `PAYLOAD_TOO_LARGE` |
    | Save failed | 500 | `STORAGE_ERROR` |
    | Anything else | 500 | `INTERNAL_ERROR` |

  - Every error body has the shape `{ "error": { "code", "message" } }`.
  - Fastify's request body limit (`bodyLimit`) is set to 16 KiB.
- **Rationale**:
  - All rules and messages live in one place, so every invalid input gets a message saying what to
    fix (SC-004).
  - Service unit tests can cover every invalid input.
  - The UI and other API clients get one consistent error shape.
  - 16 KiB comfortably fits any valid request, since a normalized URL is at most 2,048 characters. The
    spec left the request size limit to the plan.
- **Alternatives rejected**:
  - *Fastify's built-in JSON Schema validation (Ajv)*: by default it converts types, turning `null`
    into `""` and `123` into `"123"`. That blurs D7, and its messages aren't written for end users.
    Avoiding both needs custom settings and a custom error formatter.
  - *`zod`*: a dependency to validate two fields.
  - *Fastify's default 1 MiB limit*: about 500 times larger than any valid request.

## R12. Durability and startup storage checks

- **Decision**:
  - All links live in one SQLite file. The default path is `server/data/links.db`, which the existing
    `*.db` rule in `.gitignore` already excludes.
  - SQLite keeps its default journal mode (rollback), with full syncing to disk (`synchronous=FULL`,
    SQLite's default for that mode). Once an insert has returned, the link is on disk, so the API
    answers `201` only after the insert returns (FR-021).
  - At startup the service:
    1. creates the parent folder
    2. opens the database
    3. runs `CREATE TABLE IF NOT EXISTS`
    4. performs a real write: `PRAGMA user_version = 1`

    If any step fails, it prints the reason and exits with code 1 (FR-022).
  - There is no fallback to an in-memory database. `:memory:` is used in tests only.
- **Rationale**:
  - **Verified**: a write-protected database file opens without error, and so do
    `CREATE TABLE IF NOT EXISTS` and even `BEGIN IMMEDIATE`. Only an actual write fails, with
    `errcode 8: attempt to write a readonly database`. So a real write is the only reliable check.
  - **Verified**: a folder without write permission already fails when the file is opened
    (`errcode 14`).
- **Alternatives rejected**:
  - *Write-ahead log (WAL) mode with `synchronous=NORMAL`*: faster, but the latest commits can be lost
    on power failure (FR-021).
  - *Checking file permissions (`fs.access`)*: doesn't catch a locked or corrupt database, and the
    answer can change between the check and the first write.
  - *Trusting `CREATE TABLE IF NOT EXISTS`*: succeeds on read-only files, as the probe showed.
  - *Falling back to memory*: FR-022 forbids it.

## R13. Configuration

- **Decision**: `config.ts` reads three environment variables once, at startup:

  | Variable | Default | Rules |
  |----------|---------|-------|
  | `PORT` | `3000` | 1 to 65535 |
  | `BASE_URL` | `http://localhost:<PORT>` | `http` or `https`; no path, query or fragment; a trailing slash is removed |
  | `DB_PATH` | `data/links.db`, relative to `server/` | |

  An invalid value prints a message and exits with code 1. The server listens on host `localhost`
  only. Fastify then binds both loopback addresses, 127.0.0.1 and ::1.
- **Rationale**:
  - FR-020: the base address comes from configuration, never from the request.
  - Q3 and A-11: the service runs locally only, so it listens only on the machine's own loopback
    addresses.
  - Binding both addresses matters because on macOS `localhost` can resolve to `::1` first.
- **Alternatives rejected**:
  - *Deriving the address from the request's `Host` header*: the D4 defect.
  - *A config file, or `dotenv`*: a file or a dependency for three values that already have defaults.
  - *Listening on `0.0.0.0`*: exposes the service to the network, contradicting "runs locally only".
  - *Listening on `127.0.0.1` only*: clients that try `localhost` over IPv6 first (`::1`) would have
    their connection refused before they fall back.

## R14. Web UI

- **Decision**:
  - One page, built with React 19 and Vite 8. No router, no state library, no UI kit.
  - It calls `POST /api/links` with `fetch`. In dev, Vite's server forwards `/api` to
    `http://localhost:3000`, so the page and the API share one origin and no CORS setup is needed.
  - It always sends `lifetime`, from a select that defaults to 24 hours.
  - It shows `shortUrl` with a copy button, and the expiration time. The time comes from the server's
    `expiresAt`, formatted with `Intl.DateTimeFormat` in the viewer's time zone, or the page shows
    "Never expires".
  - On failure, it shows the server's `error.message`.
  - The URL input is `type="text"`. A `type="url"` field would let the browser block `example.com`
    with its own message, before the server's more helpful hint.
- **Rationale**: implements FR-007, FR-014 and FR-018 (the page uses the same documented interface as
  other software), and A-12.
- **Alternatives rejected**:
  - *CORS on the server*: extra server configuration just for dev.
  - *React Query or Redux*: there is one request.
  - *A server-rendered form without React*: the brief requires React.
  - *Validating URLs in the browser*: duplicates the FR-002 rules, which could then drift apart.

## R15. Testing approach

- **Decision**: Vitest in both packages.

  **Server tests**:
  - **Service**: real repository on `:memory:`, fake clock, fake code generator.
  - **Repository**: temporary database files, to cover reopening (FR-017), write-protected storage
    (FR-022) and duplicate keys.
  - **Config**: defaults and validation.
  - **HTTP acceptance**: one test per Story 1 and Story 2 scenario, through `app.inject()`, with no
    network port.

  **Web tests**: Testing Library on jsdom (a simulated browser). `fetch` is replaced with a stub, and
  `TZ=UTC` keeps date formatting predictable.

  **Manual checks**: SC-001 and SC-007 can't be automated tests, so they are manual checks in
  `quickstart.md` (spec, "Test design").
- **Rationale**:
  - Constitution II: each acceptance criterion gets a failing test first, and time comes from an
    injected clock.
  - `inject()` runs the real routing and response serialization without opening a port.
- **Alternatives rejected**:
  - *`supertest`*: `inject()` is built into Fastify.
  - *A real listening server per test*: needs free ports, and is slower.
  - *Playwright end-to-end tests*: downloads a browser and costs time the time box doesn't have. The
    manual quickstart run covers constitution VII.
  - *Mocking the repository in service tests*: a real `:memory:` database is fast and can't drift from
    the real behavior.
