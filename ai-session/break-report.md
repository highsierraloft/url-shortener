# Break report: adversarial pass over the RED scaffold (2026-11-20)

Scope: the uncommitted working tree on `main`. No source, helper, config, doc or existing test was
changed. New files only: `server/tests/adversarial.test.ts` (44 tests) and
`web/tests/adversarial.test.tsx` (7 tests). The existing test files are byte-identical to
`.superpowers/sdd/tasks/snap-codex/` (checked with `cmp`).

## 1. Bugs

Bug B1: ran root `bun run dev` in the background, then sent SIGTERM to its pid → bun reported "terminated by signal SIGTERM", but `node --watch src/main.ts` and Vite were reparented to PID 1 and Vite kept listening on :5174 until killed by pid → expected: stopping dev stops every child (quickstart check 7 "stop bun run dev, start it again" for FR-017/SC-006; tasks.md T010 "Stop every server you started") [no test: process lifecycle of the root dev script]

Bug B2: ran `PORT=4000 bun run --cwd web dev` with a stand-in API on :4000 → POST /api/links through Vite got 502 text/plain, because the proxy still targets :3000 → expected per quickstart (PORT is an optional setting for `bun run dev`) and FR-018 (the page uses the API) [conflicts with plan: research R14 and tasks.md T001 hard-code the proxy target http://localhost:3000] [no test: dev-server config; web tests stub fetch]

Bug B3: traced the default DB_PATH through the planned wiring (main.ts passes config.dbPath to openLinkRepository) for a start from a cwd other than server/ → no test in the suite fails for this; config.test.ts only pins the string 'data/links.db' and startup.test.ts always uses cwd server/ with an explicit DB_PATH, so the server would open a new, empty <cwd>/data/links.db where old links 404 and their codes can be issued again → expected per FR-017, FR-004, research R13 (default "relative to server/") [no test: it would have to start the server without DB_PATH, which writes the real server/data/links.db]

Bug B4: sent lifetime "constructor", "toString", "__proto__", "hasOwnProperty", ["7d"], ["never"], " 7d", "7d\n" → no test in the suite fails for this; expiration.test.ts BAD_LIFETIMES (null, "", "2h", "1H", 3600, true) are all still rejected by a plain-object lookup, a trimming lookup, or Fastify's default body schema (which coerces ["7d"] to "7d") → expected per AC US2-5, FR-011, FR-012: 400 INVALID_LIFETIME, no link

Bug B5: submitted "  HTTPS://EXAMPLE.COM:443/./a…a\t\n " whose normalized form is exactly 2,048 characters (raw 2,059) → no test in the suite fails for this; the 2,048/2,049 tests use input that is already normalized, so an extra raw-length check passes → expected per FR-002, A-03: accepted and stored as the 2,048-character normalized URL

Bug B6: submitted "https://", "http://", "https://exa mple.com", " https://example.com" → no test in the suite fails for this; MISSING_SCHEME is only tested on scheme-less input and INVALID_URL only on "not a url", and the plan's rule answers all four with "Add https:// to the start…" although they already start with it → expected per AC US1-4, SC-004: 400 INVALID_URL [conflicts with plan: data-model.md validation rule 3 / research R7 step 3; 'https://' + input parses with host "https"]

Bug B7: submitted "httpx://example.com", "http+unix://example.com", "https-proxy://example.com" → no test in the suite fails for this; the scheme tests only use javascript:, ftp: and mailto:, so `protocol.startsWith('http')` passes → expected per AC US1-4, FR-002: 400 UNSUPPORTED_SCHEME

Bug B8: submitted http://localhost, http://192.168.1.1/admin, http://127.0.0.1:3000/x, http://[::1]:8080/ → no test in the suite fails if these are rejected; every accepted URL in the suite has a public dotted host, so an "SSRF guard" passes → expected per FR-002, A-13, spec "Other inputs": 201, then 302 to the normalized URL

Bug B9: issued AAAAAAAA, then opened /AAAAAAAA/, /AAAAAAAA. and /AAAAAAAAB → no test in the suite fails if these redirect; routes.test.ts tries /abc12345/ only for a never-issued code, so ignoreTrailingSlash or an unanchored code regex passes → expected per FR-009, http-api.md (a path that isn't 8 letters and digits → 404), spec "Other inputs": the 404 page

Bug B10: sent HEAD /{code} for an active, an expired and an unknown code → no test in the suite fails for this; no test sends HEAD, so exposeHeadRoutes: false (HEAD on an active link → 404) passes → expected per http-api.md ("HEAD returns the same status and headers, with no body"), FR-008, FR-013

Bug B11: POSTed JSON with content type "application/json; charset=utf-8" or "Application/JSON" → no test in the suite fails if these get 415; every JSON request in the suite sends exactly "application/json", so an exact-string JSON-only check passes → expected per http-api.md (415 only when the type isn't application/json), FR-018: 201

Bug B12: made an unexpected error happen inside POST (createTestApp({ codes: [] }) makes the generator throw) → no test in the suite fails for this; no test reaches the error handler's "anything else" branch, so answering 500 with error.message ("fixedCodes: out of codes") passes → expected per http-api.md, research R11: 500 INTERNAL_ERROR "Something went wrong. Try again." (or STORAGE_ERROR), no internals

Bug B13: created 1h, 30d and never links on a file database, reopened it with a new service 2 h later, then 100 years later → no test in the suite fails for this; link-repository.test.ts checks only stored fields after reopening and the expiry tests use one in-process service, so keeping expiry in an in-memory Map passes → expected per SC-006, FR-017, AC US2-3, AC US2-7: the expired link stays 404, active links still redirect

Bug B14: opened a non-SQLite file, and a DB_PATH whose parent folder can't be created, via openLinkRepository and `node src/main.ts` → no test in the suite fails for this; only the open (errcode 14) and the PRAGMA write (errcode 8) are made to fail, so try/catch around just those passes while CREATE TABLE (errcode 26) and mkdir (EACCES/EEXIST) escape as raw errors → expected per FR-022, research R12 ("if any step fails… exits with code 1"): StorageError, exit 1 naming storage

Bug B15: generated 2,000 codes and counted the symbols in each position → no test in the suite fails for this; only /^[A-Za-z0-9]{8}$/ and SC-005 uniqueness are checked, which `Math.random().toString(36).slice(2, 10)` (lowercase and digits) passes → expected per FR-006, D3, the spec's "about 2×10^14" codes (62^8, research R6): all 62 symbols in every position

Bug B16: started `node src/main.ts` on a free port and connected via 127.0.0.1, ::1 and the LAN IPv4 address → no test in the suite fails for this; no test starts the server successfully, so host '0.0.0.0' (reachable from the network) or '127.0.0.1' (::1 refused) passes → expected per http-api.md ("listens on localhost only, covering both loopback addresses"), research R13, A-11, Q3

Bug B17: in the UI, got a result, then a 400/500 on the next submit; separately, copied link 1, then created link 2 → no test in the suite fails for this; App.test.tsx checks errors only on a fresh page and only error → success, so a kept result or a sticky "Copied" passes → expected per contracts/web-ui.md (Error state: "No result is shown"; Copy reads "Copied" after copying that link)

Bug B18: posted through the Vite proxy with the API down → the proxy answered 502 text/plain with an empty body, so fetch resolves; no test in the suite covers a non-JSON failure, and an api.ts that reads response.json().error.message passes the suite but throws here, leaving no message → expected per contracts/web-ui.md (Network failure: "Couldn't reach the service. Try again."), SC-004 [conflicts with plan: tasks.md "Module interfaces" (web/src/api.ts) maps only a rejected fetch to that message and every other failure to error.message]

Bug B19: made fetch reject, then retried → no test in the suite fails for this; "re-enables the Shorten button" covers only a 400, so an App that resets "Shortening…" only on the non-throwing path passes and the button stays disabled → expected per contracts/web-ui.md (Submitting only while in flight; the Network failure message says "Try again.")

Bug B20: typed a URL and pressed Enter → no test in the suite fails for this; every test clicks Shorten, so a page without a <form> (button onClick) passes and Enter does nothing → expected per contracts/web-ui.md (Shorten "Submits the form"), FR-001, SC-001

Bug B21: showed a result in a non-UTC time zone → no test in the suite fails for this; Vitest runs with TZ=UTC, so an App that formats with timeZone: 'UTC' passes → expected per FR-014 ("in the viewer's local time zone"), contracts/web-ui.md Success state

## 2. Tests per bug, and why they fail now

How the claims were checked (all in the scratchpad, nothing in the repo):

- **Pass for a correct implementation**: a throwaway reference implementation of every server
  module (plan-correct, except B6 where it follows the spec) passes all 186 server tests (142
  existing + 44 new). A reference `App.tsx`/`api.ts` passes all 25 web tests (18 + 7), with the
  expiry formatter at module scope and, in a second run, inline.
- **The existing suite misses it**: each sloppy variant below, applied to the reference, passes all
  142 existing server tests (or all 18 existing web tests) and fails only the matching new test.

| Bug | Sloppy variant that stays green on the existing suite |
|-----|-------------------------------------------------------|
| B4 | `table[lifetime]` lookup; `lifetime.trim()`; Fastify body schema `lifetime: { type: 'string' }` |
| B5 | `if (url.length > 2048)` on the raw input |
| B6 | data-model rule 3 as written |
| B7 | `protocol.startsWith('http')` |
| B8 | reject hosts without a dot, 127/10/192.168 and IPv6 literals |
| B9 | `ignoreTrailingSlash: true`; unanchored `/[A-Za-z0-9]{8}/` |
| B10 | `exposeHeadRoutes: false` |
| B11 | `onRequest` hook comparing the content type to the exact string |
| B12 | fallback branch sends `error.message` |
| B13 | expiry read from an in-memory Map filled by `create` |
| B14 | try/catch around only `new DatabaseSync` and the PRAGMA write |
| B15 | `Math.random().toString(36).slice(2, 10)` |
| B16 | `listen({ host: '0.0.0.0' })`; `listen({ host: '127.0.0.1' })` |
| B17 | result not cleared on error; `copied` not reset on a new result |
| B18 | api.ts per the tasks.md comment: `await response.json()`, then `body.error.message` |
| B19 | api.ts lets a rejected fetch throw; App resets busy only on the success path |
| B20 | `<div>` plus `<button type="button" onClick>` instead of a form |
| B21 | `new Intl.DateTimeFormat(undefined, { …, timeZone: 'UTC' })` |

### server/tests/adversarial.test.ts (44 tests, all failing now)

| Bug | Tests | Current failure |
|-----|-------|-----------------|
| B4 | `Bug B4: the service rejects lifetime %s with INVALID_LIFETIME and stores nothing` (8); `Bug B4: POST /api/links answers lifetime %s with 400 INVALID_LIFETIME and creates no link` (8) | `Error: Not implemented` |
| B5 | `Bug B5: accepts input whose normalized form is exactly 2,048 characters although the raw text is longer` | `Error: Not implemented` |
| B6 | `Bug B6: rejects %s with INVALID_URL, not with the "Add https://" hint` (4); `Bug B6: POST /api/links answers "https://" with 400 INVALID_URL` | `Error: Not implemented` |
| B7 | `Bug B7: rejects the look-alike scheme in %j with UNSUPPORTED_SCHEME` (3) | `Error: Not implemented` |
| B8 | `Bug B8: accepts %j and redirects to %j, like any http URL with a host` (4) | `Error: Not implemented` |
| B9 | `Bug B9: %s, built on the issued code AAAAAAAA, gives the not-found page and no redirect` (3) | `Error: Not implemented` |
| B10 | `Bug B10: HEAD on an active link answers like GET (302, Location, no-store) with no body`; `Bug B10: HEAD on an expired link and on an unknown code answers like GET (404 page headers) with no body` | `Error: Not implemented` |
| B11 | `Bug B11: accepts a JSON body sent with content type %j` (2) | `Error: Not implemented` |
| B12 | `Bug B12: an unexpected failure answers 500 with a contract error body and no internal details` | `Error: Not implemented` |
| B13 | `Bug B13: after a restart on the same database file, expired links stay 404 and active ones still redirect (SC-006)` | `Error: Not implemented` |
| B14 | `Bug B14: opening a file that is not a SQLite database throws StorageError`; `Bug B14: a parent folder that cannot be created throws StorageError` | AssertionError: expected error to be instance of StorageError |
| B14 | `Bug B14: startup exits with code 1 and mentions storage when the database file is %s` (corrupt, uncreatable) | AssertionError: stderr (the placeholder's `Error: Not implemented` stack) doesn't match `/storage/i` |
| B15 | `Bug B15: generated codes use all 62 letters and digits in every position (FR-006, about 2×10^14 codes)` | `Error: Not implemented` |
| B16 | `Bug B16: the started service listens on both loopback addresses and on no other interface` | AssertionError: expected false to be true (the placeholder exits before anything listens on 127.0.0.1) |

Notes for the reviewer:

- B14's startup tests assert `/storage/i` on stderr, the same convention as `startup.test.ts`.
- B12 accepts either `INTERNAL_ERROR` or `STORAGE_ERROR`, each with its exact contract message.
- B16 spawns a real server on a free port with a temporary `DB_PATH` and stops it in `afterEach`. It
  assumes `localhost` resolves to both loopback addresses (true on macOS). It checks every
  non-internal IPv4 address; if there is none, that part checks nothing.
- B15's chance of failing for a correct generator is about 4×10^-12 (a symbol missing from one of
  8 positions across 2,000 draws).

### web/tests/adversarial.test.tsx (7 tests, all failing now)

Every test fails with `Unable to find an accessible element with the role "textbox" and name "Long
URL"`, because the `App` placeholder renders nothing.

| Bug | Tests |
|-----|-------|
| B17 | `Bug B17: after a later %i error, the earlier result is no longer shown` (400, 500); `Bug B17: a new link's Copy button reads "Copy" until clicked, then copies the new link` |
| B18 | `Bug B18: a 502 with an empty text/plain body (the Vite proxy with the API down) shows the network message` |
| B19 | `Bug B19: after fetch rejects, Shorten is enabled again and a retry succeeds` |
| B20 | `Bug B20: pressing Enter in the Long URL field submits the form` |
| B21 | `Bug B21: the expiry is shown in the viewer's own time zone, not in UTC (FR-014)` |

Note: `vi.hoisted` sets `TZ=Pacific/Kiritimati` (UTC+14) before `App` is imported, so the whole file
runs in that zone; `afterAll` restores it. B21 first asserts that local and UTC text differ, so it
can't pass vacuously. Only `fetch` is stubbed, and Copy uses user-event's built-in clipboard.

### No-test bugs

- **B1**: also a correctness risk for verification. Once `main.ts` works, an orphaned server keeps
  :3000. The "restarted" server then fails to bind, and quickstart check 7 gets its 302 from the old
  process, which is a false pass for FR-017/SC-006. Stopping by process group (`kill -TERM -<pgid>`)
  left nothing behind.
- **B2**: changing the server port while keeping the UI working needs the proxy target to follow
  `PORT`. Today it can't.
- **B3**: angle B, so not observed. The plan never says main.ts resolves the path against `server/`.

## 3. Tried and held up

- Root `bun run test` exits 1 when tests fail: 1 at start, with 142 server and 18 web failures, and
  both packages ran to the end. In a scratch two-package workspace, `bun run --filter '*' test` also
  exits 1 when only one package fails. Constitution VII's exit code is reliable.
- Root `bun run typecheck` exits 0. I added a temporary type error to `server/tests/` and
  `web/tests/` (removed right after); both packages reported TS2322 and the root exited 1.
- The hook from a different cwd (the scratchpad), with absolute paths: a `web/src/App.tsx` edit gave
  exit 2 with the web test output (correct for RED), a `.md` path gave 0, and a missing `file_path`
  gave 0. Caveat, not counted as a bug: with a relative `file_path` that doesn't lead to a
  `package.json`, `dirname .` stays `.` and the loop never ends (killed by a 5 s alarm, exit 142).
  Claude Code sends absolute paths for Edit and Write, so it isn't reachable today.
- Helpers at their edges. `fakeClock(0).now()` is 0 (the default applies only to `undefined`).
  `fakeClock()` gives 2026-01-01T00:00:00.000Z, and `advance(-5)` and `set(1.5)` behave literally.
  `fixedCodes()` throws `fixedCodes: out of codes` on the first call, and `fixedCodes('A','B')`
  returns A, then B, then throws. `createTestApp` with `undefined`, `{}`, `{codes: []}`,
  `{codes: [...]}`, `{clock}` and `{baseUrl: ''}` all reach the `openLinkRepository` placeholder.
  `codes: []` is truthy, so it gives a generator that always throws, which B12 uses.
- `url` coerced with `String(...)` in the service: caught. `link-service.test.ts` expects
  INVALID_URL for `{url: {}}` and `{url: ['https://example.com']}`. At HTTP level, a Fastify schema
  for `url` would coerce `null` to `""` and `42` to `"42"`, and `routes.test.ts` would fail, so no
  test was added.
- `<input type="url">`: jsdom blocks submitting `example.com` (probe: 0 submits), so the existing
  400 test catches it.
- Fastify 5.12 defaults (probed with a minimal plan-correct app): HEAD routes are exposed,
  `application/json; charset=utf-8` and `Application/JSON` are parsed, other content types get 415,
  and `/CODE/`, `/CODE.` and `/CODEX` give 404. So B9 to B11 ask nothing a plan-correct server
  doesn't already do.
- `bun run dev` when the server crashes (the placeholder throws): `node --watch` prints "Failed
  running 'src/main.ts'. Waiting for file changes before restarting...", dev keeps running, and Vite
  answers `/api` with 502. This is by design of `node --watch` (R1). FR-022's exit 1 is checked
  through `start` (quickstart check 9). The UI side is B18.
- SIGINT to a background `bun run dev` was ignored, because a non-interactive shell starts `&` jobs
  with SIGINT ignored. That's a shell artifact, not a bug.
- Observed but not counted: port 5173 was taken by another project's Vite, so this one moved to
  5174 without stopping. The quickstart's "open http://localhost:5173" would show the other app.
  This depends on the environment.
- `passWithNoTests: true` (needed by T001) means a test glob that matches nothing exits 0. Nothing
  misbehaves today.
- `/AAAAAAA%41` redirects, because Fastify decodes `%41` to `A`. Percent-encoded unreserved
  characters are equivalent under RFC 3986, so this isn't counted.
- FR-003 (creators can't choose the code): no direct test, but only an implementation that reads a
  `code` field from the body would break it. Too unlikely to add.

## 4. Commands and exit codes

| Command | Exit | Result |
|---------|------|--------|
| `bun run test` (root, before adding tests) | 1 | server 142/142 failed, web 18/18 failed |
| `bun run typecheck` (root) | 0 | both packages 0 |
| `bun run typecheck` with a temporary type error in `server/tests/` and `web/tests/` | 1 | both report TS2322; probe files removed |
| scratch workspace `bun run test` (one package fails, one passes) | 1 | |
| scratch workspace `bun run dev`, then `kill -TERM <pid>` | n/a | child `sh` left with PPID 1; removed with `pkill` |
| `bun run dev` (root, background, 6 s) | n/a | server: `Error: Not implemented`, then "Waiting for file changes"; Vite on :5174 (5173 in use) |
| `curl -i -X POST http://localhost:5174/api/links …` | 0 | `HTTP/1.1 502 Bad Gateway`, `Content-Type: text/plain`, empty body |
| `kill -TERM <bun run dev pid>` | 0 | `node --watch` and `vite` left with PPID 1, vite on :5174; then `kill -TERM` on both |
| `bun run dev`, then `kill -INT <pid>` | 0 | ignored (shell artifact); stopped with `kill -TERM -<pgid>`, nothing left |
| `check.sh` from the scratchpad, absolute `.tsx` path | 2 | web test failures (expected in RED) |
| `check.sh`, `.md` path / no `file_path` | 0 / 0 | |
| `check.sh`, relative path, under `perl -e 'alarm 5'` | 142 | infinite loop, killed by SIGALRM |
| `node helpers-probe.ts` | 0 | helper edge results above |
| `node rule3.mjs`, `fastify-probe.mjs`, `sqlite-probe.mjs`, `ajv-probe.mjs` | 0 | validation, Fastify, node:sqlite and Ajv probes |
| temporary jsdom probes in `web/tests/` (removed) | 0 / 1 | values surfaced through a failing assertion by design |
| `PORT=4000 bun run --cwd web dev` + stand-in API on :4000 + `curl` via proxy | 0 | proxy 502; :4000 direct 200; all stopped by process group |
| `bun run typecheck` in `server/` | 0 | |
| `vitest run tests/adversarial.test.ts` in `server/` | 1 | 44/44 failing as listed |
| `bun run typecheck` in `web/` | 0 | |
| `vitest run tests/adversarial.test.tsx` in `web/` | 1 | 7/7 failing as listed |
| reference server: `tsc --noEmit`, `vitest run` | 0, 0 | 186/186 pass |
| reference web: `tsc --noEmit`, `vitest run` | 0, 0 | 25/25 pass |
| `node mutate.mjs` (17 server variants), `node mutate-web.mjs` (7 web variants) | 0 | table in section 2 |
| `bun run typecheck` (root, final) | 0 | server 0, web 0 |
| `bun run test` (root, final) | 1 | server 186 failed (142 + 44), web 25 failed (18 + 7) |
| `cmp` of the existing tests against `snap-codex/` | 0 | identical |

Every process I started was stopped. Afterwards, nothing from this pass listened on :3000, :4000 or
:5174, and no `src/main.ts` process remained. The temporary probe files in `server/tests/` and
`web/tests/` were removed, and no `links-adversarial-*` folders are left in the OS temp dir.
