# Process Log

Human interventions and review decisions (constitution, Development Workflow and Quality Gates).

## Final status

The URL shortener implementation and T001–T010 are complete. The final root test run passed all 220
tests; server and web type checks passed. Gate 4's four review findings were addressed and the scoped
re-review accepted the fixes. SC-001 remains unverified until a first-time user completes its timed
check. The live curl transcripts for all 12 acceptance scenarios are in `docs/verification.md`; the
temporary API and Vite sessions were stopped and their database removed. The approved US1 and US2
commits are `2900ebe` (`feat: implement URL shortening and redirect flows`) and `a227de5`
(`feat: add link expiration`); the approved documentation commit is `docs: finalize reviewer and
verification records`. A clean clone at the documentation commit installed and ran the app. The
default `node` was v21 in that environment, so Node 26 had to be selected on `PATH`. Vite used 5174
because 5173 was busy; the README directs readers to the URL Vite prints. The clone's tests and
typechecks passed, and Ctrl+C stopped its dev processes.

## Method and tool choices

1. **Specify before coding.** `/speckit-specify` and `/speckit-clarify` produced the feature
   specification. `/speckit-analyze` checked coverage and consistency across the specification,
   plan, data model, contracts, quickstart and task list. The human approved the specification and
   plan at Gates 1 and 2.
2. **Use test-first, task-sized implementation.** Superpowers v7.0.2's
   `subagent-driven-development` and `test-driven-development` workflows were used. T001 established
   the workspace; T002–T005 wrote tests before feature code; T006–T010 implemented one task at a time.
   Work stayed on `main`, as the approved constitution requires. Implementers did not commit.
3. **Review independently.** Each implementation task received a scoped specification and quality
   review. A separate Codex `gpt-6-luna` review examined the RED suite and then the complete change.
   A separate adversarial pass added tests for behaviors the existing suite missed. Review diffs used
   a temporary Git index because the workflow required review before commits and the tree was
   uncommitted.
4. **Verify through project scripts and real interfaces.** Bun workspace scripts run Vitest and
   TypeScript checks with the repository configuration. Tests inject the clock for expiry behavior
   instead of sleeping. T010 used the quickstart's `curl` checks, a browser walkthrough, storage and
   restart checks, and the SC-007 timing check. The in-app browser was used for the UI walkthrough
   because the available Playwright runner used `npx`, contrary to the Bun-only project rule.

These choices keep decisions reviewable, make acceptance criteria executable, and preserve the
project's direct-to-`main` constraint. The constitution v2.0.0 sends decisions with real alternatives
to `specs/001-url-shortener/research.md`; there is no separate ADR directory.

## Four gates

| Gate | Review point | Human decision and recorded result |
|------|--------------|------------------------------------|
| 1 | Feature specification | Approved on 2026-11-20. The scope, lifetimes, local-only operation and acceptance criteria were fixed before implementation. |
| 2 | Plan, research, data model, contracts and tasks | Approved on 2026-11-20, including T001's placeholder modules. The planned redirect remained 302. |
| 3 | Test-first setup and RED suite | Approved after T001–T005 and the test-gap fixes. The human chose JSON-only request handling; Codex triage and adversarial findings were then reviewed, approved and incorporated before implementation resumed. Tests were observed failing before feature implementations. |
| 4 | Whole-change review and final triage | Approved disposition on 2026-11-20. Bodyless requests return 400 even with a non-JSON content type; present non-JSON bodies return 415. SC-007 documentation was aligned and SC-001 marked unverified. Four findings were fixed and scoped re-review passed. |

## Review triage

### `/speckit-analyze`

| Outcome | Findings and action |
|---------|---------------------|
| Fixed (12 findings, grouped below as recorded) | Added final-review/Gate 4 requirements to `tasks.md`; added FR-015 and SC-007 automated tests; aligned `plan.md` structure and coverage; updated stale D3/D8 accepted-risk and test-design notes; clarified `{ "url": null }`; trimmed input before the missing-scheme hint; corrected the R11 error attribution; enabled Vitest globals and included web tests in typecheck; documented T010 server restart steps; recorded PROCESS logging in task notes. |
| Ignored (5 findings) | SC-001 remains a manual check requiring a first-time user; only T001 has a separate “Done when” because the shared brief covers the rest; some US2 UI work occurs in US1 tasks; assumptions repeat some FR values; tool-version compatibility is not independently verified and T001 checks it at setup. |

### Codex review of the RED suite (C1–C12)

| Finding | Decision | Result |
|---------|----------|--------|
| C1: expired code reuse | Agree | Added a test that an expired code is not reused. |
| C2: sequential code generator could pass | Agree | Covered by adversarial B15, which checks for all 62 symbols in every code position. |
| C3: restart only checked at repository level | Agree | Covered by B13, which checks expiry persistence across a service restart. |
| C4: lifetime across daylight-saving change | Agree | Added a duration test across a daylight-saving boundary. |
| C5: UTC-only UI test | Agree | Covered by B21, which checks viewer-local time formatting. |
| C6: `INTERNAL_ERROR` response | Agree | Added direct coverage; B12 alone was not exact because it also accepted `STORAGE_ERROR`. |
| C7: `HEAD` untested | Agree | Covered by B10. |
| C8: exact 16 KiB body and extra fields | Agree | Added HTTP coverage for the body-size boundary and extra fields. |
| C9: UI 413 handling | Agree | Added UI coverage. |
| C10: permission tests when running as root | Agree, low priority | Added a guard to skip permission-bit assertions when root makes them ineffective. |
| C11: tabs and pre-encoded URLs | Agree | Added input cases. |
| C12: UI fixture used a 7-character code and wrong `7d` expiry | Agree | Corrected the fixture to an 8-character code and finite expiry. |

The human confirmed these recommendations and requested the missing tests. B2, B6 and B18 plan
conflicts were approved; B1 and B3 were also added to the plan. The detailed review is in
`.superpowers/sdd/tasks/codex-review.md`.

### Task and final reviews

| Scope | Review result | Triage |
|-------|---------------|--------|
| T001–T002 | Passed with minor notes | Setup checks passed. Test gaps and shell environment leakage were closed during the Gate 3 fix round. |
| T003–T004 | Passed after ruling/gap fixes | The initial 415 concern was resolved against the approved contract and tests; retry, body, 404, port and UI gaps were closed. Minor title/accessibility notes were non-blocking. |
| T005 | Passed with minor notes | Expiration coverage was written before implementation. A HEAD-expired case was noted but not required by the brief. |
| T006 | Passed | Reviewer could not initially verify read-only database behavior; the existing initialized-database test and focused run resolved it. |
| T007 | Passed after ruling | Bodyless/no-content-type behavior follows the contract's 400 rule; 415 applies to a present body without JSON content type. Gate 4 later added the `text/plain` bodyless case. |
| T008 | Passed | No findings. The root test evidence was corrected to use the repository script. |
| T009 | Passed | No code findings. Final reviewer accepted the pre-implementation RED evidence from the preceding root run. |
| T010 | Passed after one fix round | Added missing invalid-URL and “Never” UI observations and complete CLI evidence; scoped re-review marked both findings addressed. |
| Whole-change review | No Critical or Important issues; four Minor findings | All four were addressed at Gate 4 and passed scoped re-review. Details follow. |

### Gate 4 whole-change findings

| Finding | Human disposition | Resolution and re-review |
|---------|-------------------|--------------------------|
| Bodyless `POST` with `Content-Type: text/plain` returned 415 instead of 400 | Approve 400 when no body exists; keep 415 for a present non-JSON body | Added route regression and changed dispatch. Scoped re-review accepted. Explicitly empty parsed non-JSON bodies use the bodyless rule; no separate test covers that exact variant. |
| Plan/research described SC-007 as manual-only | Update status | Documentation now records automated timing and manual verification. |
| R11 described removing the default text parser, while code guards in the route | Align documentation | R11 now describes the route-level JSON content-type guard. |
| SC-001 was not supported by a first-time user's timed observation | Mark unverified | T010 and the plan keep SC-001 unverified until that manual check occurs. |

## Adversarial and mutation results

The break pass recorded 21 bug hypotheses and added 44 server tests and 7 web tests in new files; it
did not edit the existing tests or implementation. The report records that a throwaway reference
implementation passed all 186 server tests (142 existing plus 44 new), and the web reference passed
all 25 web tests (18 existing plus 7 new). It exercised 17 server and 7 web deliberately sloppy
variants in scratch: each passed the pre-existing tests for its package and failed its corresponding
new test. Three hypotheses conflicted with the plan (B2, B6, B18) and went to the human before code
changes. The approved changes were incorporated; B1 and B3 were also added to the plan.

These are run artifacts from the break pass, not a formal mutation-testing run. No mutation-testing
tool, mutation score, or exhaustive mutant count was recorded. The counts above describe the tested
scratch variants and test runs only. Full cases and observed behavior are recorded in the break pass
section below and `.superpowers/sdd/tasks/break-report.md`.

## Time by phase

The available T3 activity history records event timestamps, not focused work time. These are wall-clock
spans between visible milestones; they include review waits, handoffs and other pauses, so they are not
estimates of focused effort or person-hours. Timestamps are UTC.

| Phase | Recorded window (2026-11-20 UTC unless noted) | Wall-clock span | Limit |
|-------|------------------------------------------------|-----------------|-------|
| Specification and planning | 2026-11-19 to 2026-11-20 | Unknown | The specification work began on 2026-11-19; the activity history does not record its start. The spec-readiness prompt began at 13:23:10 and its visible review ended around 13:25:20, but that was not the whole phase. |
| Setup and initial RED suite | 13:27:29–13:43:43 | About 16 min | Ended at the requested Gate 3 stop. |
| Gate 3 decisions, test-gap fixes and review | 13:51:38–14:52:11 | About 1 h 1 min | Includes user review, a service time-limit interruption, and the resumed review; focused effort is unknown. |
| T006–T010 implementation and task reviews | 14:53:08–15:45:09 | About 52 min | Window from SDD implementation resumption to whole-change review start; includes sequential subagents and review waits. |
| Whole-change review and Gate 4 | 15:45:09–16:16:18 | About 31 min | Gate 4 was approved at 15:58:54; fixes and scoped re-review completed by 16:16:18. |
| Final reviewer documentation and live AC verification | 16:25:04–16:56:55 | About 32 min | Includes parallel document work, live curl checks, a fresh 220-test run, both clone checks, and the README correction; this is elapsed time, not focused effort. |

## Limitations

- **SC-001 is unverified.** It requires a first-time user to finish the page workflow within 30 seconds. No qualifying participant completed that timed check.
- **SC-007 is a local measurement.** T010 recorded a p95 of `0.000761s` in the project's timing check; it does not measure network or deployment latency.
- **The adversarial pass is not formal mutation analysis.** Results apply to the specific throwaway variants exercised; no exhaustive mutation score exists.
- **Phase durations are event windows only.** No time-tracking data records active labor.
- **The scope is local and deliberately limited.** Public hosting, authentication, abuse controls, link revocation and destination safety remain outside the approved feature scope.
- **Separate ADR files are intentionally absent.** Constitution v2.0.0 records decisions with alternatives in `research.md`.
- **The first clean Git clone used old HEAD `68f3d6b`.** It had no README or app files, so the subagent could not follow the README. After the approved commits, a fresh clone passed install, launch, API examples, tests, and type checks.
- **The clone environment had Node v21 first on `PATH`.** Node 26 was installed and worked after it was selected as the active runtime; the README now tells reviewers to check `node --version`.
- **Commit messages were approved before committing.** US1, US2, and the final documentation were committed separately on `main`.

## Chronological intervention log

The entries below preserve the decisions as they were recorded at each point in the work. Phrases
such as “pending” and “not yet approved” describe that earlier point; later entries record the
decision or resolution.

## Phase 1: Specification (2026-11-19 to 2026-11-20)

The phase used `/speckit-specify` and `/speckit-clarify`, followed by a QA pass on the spec. Output:
`specs/001-url-shortener/spec.md`.

### Questions asked

Questions 1 to 3 came from `/speckit-specify`, 4 and 5 from `/speckit-clarify`, and 6 to 8 from the QA
pass.

| # | Question | Claude recommended | Human decided |
|---|----------|--------------------|---------------|
| 1 | Is an expiration required, and what applies when none is given? | Optional; without one, a link never expires | Expiration is a security measure; the creator picks how long the link lives; expired links return 404 |
| 2 | Can the expiration change after creation? | No | No |
| 3 | Who can create links? | Anyone, without signing in | Anyone, without signing in |
| 4 | Must every link expire, or can the creator choose "never"? | Every link expires; 24 h by default | "Never" is allowed; 24 h by default |
| 5 | Which lifetimes can the creator choose? | Fixed list: 1 h, 24 h, 7 d, 30 d, never | As recommended |
| 6 | Expiration doesn't protect the destination. Is that acceptable? | No recommendation | Out of scope |
| 7 | Should whoever runs the service be able to disable a harmful link? | No recommendation | Out of scope |
| 8 | Could the service be reachable publicly? | No recommendation | Out of scope; it runs locally only |

### Claude recommendations the human rejected

- **Q1**: links without an expiration never expire. Rejected, because expiration is meant as a security
  measure. The default became 24 h.
- **Q4**: every link must expire. Rejected: "never expires" stays as an explicit choice. No reason
  given.
- **QA findings D3, D8, D9**: not adopted, and no reason given. They are recorded as accepted risks in
  the spec.
  - D3: code length, upper/lower case, and clashes with the app's own addresses.
  - D8: an explicit no-caching rule for redirects.
  - D9: rejecting URLs that contain a user name or password.

### Claude errors the human corrected

- **A-05** assumed the creator types an expiration date and time. Corrected: the creator picks a
  lifetime.
- **A-07** assumed expired links show their own "link expired" message. Corrected: they return the same
  404 as unknown codes.

### Claude errors found in the QA pass

The QA pass, run at the human's request, found 9 defects in Claude's draft. The human accepted 6:

- D1: normalize URLs the way browsers do.
- D2: count the URL length on the normalized form.
- D4: use a configured base address.
- D5: save a link before showing it; refuse to start without writable storage; run a single instance.
- D6: lifetimes in exact hours; the service's clock is the reference; the page shows the expiration
  time the service calculated.
- D7: only an omitted lifetime means 24 h.

### Open at the end of Phase 1 (resolved later below)

- Claude chose to keep times to the millisecond, without rounding, while applying D6. The human hasn't
  confirmed this.
- Not adopting D8 conflicts with Story 2 scenario 4 and FR-010: an expired link must stop working, even
  for visitors who used it before. This was flagged, and no decision has been made yet.
- Part of D3, a code matching one of the app's own page addresses, was flagged as a bug. No decision
  has been made yet.
- Gate 1 (spec approval): no explicit approval has been recorded yet.

## 2026-11-20: Git workflow

- The human ruled out branches, PRs and git worktrees for this project, because they add a bottleneck
  that doesn't fit the time box. All work goes directly on `main`.
- The spec commit, which Claude had made on a feature branch, was moved to `main` and pushed
  (`3efd939`). The rule is now in `CLAUDE.md`.
- This conflicts with constitution principle VI, which gives git worktrees to Superpowers. Amending the
  constitution needs the human's approval.

## 2026-11-20: Gate 1 approved, constitution 2.0.0

- **Gate 1**: the human approved the spec.
- **Constitution 1.0.0 → 2.0.0**, approved by the human. This is a MAJOR bump, because principle V is
  redefined.
  - **VI**: git worktrees are removed from Superpowers' execution duties. Worktrees, branches and PRs
    are now forbidden, and all work goes on `main`.
  - **V**: ADRs are dropped. Decisions with real alternatives go in the feature's `research.md`,
    including the rejected options and the reasons.
  - Gate 2, the final review and the governance rule on complexity now point to `research.md`.
  - `CLAUDE.md` and `plan.md` were updated to match. This closes the plan's VI deviation and its V
    action item.
- **Phase 1 open items handled at plan level**:
  - The D3 code clash is resolved by research R6: only 8-character letter-and-digit paths are treated
    as codes, and every other server address is under `/api/`.
  - The D8 conflict with Story 2 scenario 4 is resolved by research R10: redirects send
    `Cache-Control: no-store`.
  - Millisecond precision is in FR-013.
- **301 or 302**: Claude recommended keeping 302. A 301 contradicts FR-010, and browsers cache it,
  which defeats expiry. The human went ahead with the plan as written, so 302 stays (research R10).

## 2026-11-20: `/speckit-analyze` triage

The human asked for every finding to be either fixed or ignored with a reason. Claude made the calls;
the full table was shown to the human.

- **Fixed** (12 findings):
  - The final review by a different model, and gate 4, added to `tasks.md` (constitution).
  - An automated test for FR-015 added to T003.
  - An automated timing test for SC-007 added to T003.
  - `plan.md`'s structure and coverage table brought in line with `tasks.md`.
  - The spec's stale "accepted risk" notes for D3 and D8, and its test-design note, updated.
  - Data-model rule for `{"url": null}` made unambiguous: it gives `INVALID_URL`, not `URL_REQUIRED`.
  - The missing-scheme hint now checks the trimmed input.
  - A misattributed error row in research R11 corrected.
  - Web setup: Vitest globals on, so Testing Library cleans up between tests; test files included in
    the type check.
  - T010 now says how to restart servers between checks.
  - `PROCESS.md` logging added to the task notes.
- **Ignored, with reasons** (5 findings):
  - SC-001 stays manual: it needs a first-time human.
  - Only T001 has an explicit "Done when"; the shared brief covers the rest.
  - The US2 parts of the UI are built in US1 tasks.
  - Assumptions restate some FR values.
  - Tool-version compatibility isn't verified; T001's checks catch it.

## 2026-11-20: Gate 2 approved

- The human approved T001's placeholder modules: typed stubs that only throw `Not implemented`. This is
  the scaffolding exception the TDD skill reserves for the human.
- **Gate 2**: the human approved the plan, research and tasks. The redirect stays a 302 (research R10).
- Execution moves to a separate thread, using Superpowers subagent-driven development on `tasks.md`.

## 2026-11-20: Execution start

- The human started execution with Superpowers subagent-driven development.
- **Commits**: one per user story, not one per task. The message is shown to the human and approved
  before each commit.
- **Stop point**: after setup (T001) and the first user story's failing tests, so the human can review
  them (gate 3) before any implementation. Claude includes T002 (configuration, storage and startup
  tests) in this batch, because T006 implements against it and blocks US1's server work. T005 (US2
  tests) waits.
- Open items at the execution-start checkpoint, resolved or triaged later: plan.md and research R15 still call SC-007
  manual-only; research R7 step 3 doesn't trim the input (data-model.md does); `HEAD /{code}` has no
  test; the "expired after a restart" half of SC-006 has no test.

## 2026-11-20: Setup and US1 failing tests (checkpoint before Gate 3)

- T001 (scaffold), T002 (configuration, storage and startup tests), T003 (US1 service and HTTP tests)
  and T004 (UI tests) are done, each with a spec and quality review. Nothing is committed yet.
- Result: 113 tests, all failing for the intended reason; the type check passes.
- **Review decision, T003**: the reviewer flagged that a `text/plain` body only gets `415` if the server
  removes Fastify's default `text/plain` parser, which no plan document says. Claude kept the test,
  because tasks.md requires `415` and the contract allows it. T007 has to make the server reject
  non-JSON content types. This is open for the human at gate 3.
- Minor review findings are listed for the human at gate 3, because the implementation tasks can't add
  or change tests.

## 2026-11-20: Gate 3 (US1 and foundational tests) approved

**What happened**: Claude stopped after T001–T004, as the human had asked. There were 113 tests, all
failing for the intended reason, and the type check passed. Claude raised three decisions:

1. A `text/plain` body only gets the `415` that tasks.md requires if the server removes Fastify's
   default `text/plain` parser.
2. The reviews found test gaps that only the RED step can close, because GREEN tasks may not change
   tests:
   - no test pins exactly 5 retry attempts
   - no test checks that the 404 pages are identical
   - no test sends an empty JSON body or a request without a content type
   - the valid `PORT` boundaries (1 and 65535) aren't tested
   - the startup tests inherit `BASE_URL` and `DB_PATH` from the shell
   - the route tests never close their in-memory databases
   - some test titles are misleading
3. If T005 (US2 tests) were written after US1's implementation, the "never expires" tests would pass
   from the start, because US1 stores no expiry.

**What the human said**:

1. "Let's accept JSON only."
2. "This is a very important one; please do update the tests and check if satisfied."
3. "Agreed." Claude's recommendation was to write T005 now, before any implementation.
4. "Approved." This is gate 3 for the tests reviewed so far.

The human also asked for a review of the work so far by Codex (`gpt-6-luna`, maximum reasoning effort)
through T3. Each Codex finding gets an agree or disagree with a reason, and nothing is fixed until the
human confirms. In parallel, Claude tries to break what exists, recording each bug as
`Bug: <what I did> → <what happened> → <expected per AC>` with a failing test and no fix.

**Why**:

- (1) The human chose JSON only; no further reason was given. It makes `415` the defined answer for any
  non-JSON body, and research R11 and the HTTP contract are updated to say so.
- (2) The human called this very important. GREEN tasks can't add tests (constitution IV), so the gaps
  can only be closed now.
- (3) The human agreed with Claude's reason: a test that passes before its code exists breaks
  constitution II.

## 2026-11-20: Break pass (adversarial testing, no fixes)

At the human's request, a separate Claude agent tried to break what exists while Codex reviewed it.
Each bug gets a failing test, except where `[no test]` says why that isn't possible. Nothing is fixed.

- **New tests**: 44 in `server/tests/adversarial.test.ts` and 7 in `web/tests/adversarial.test.tsx`, each
  named `Bug B<n>: …`. No existing test file changed.
- **How each test was checked**: the agent ran it against a throwaway reference implementation and
  against deliberately sloppy variants, outside the repository. Each test passed the reference.
- **What each test catches**: each sloppy variant passed the whole existing suite and failed only its new
  test. So every bug below is a hole in the existing safety net.
- **Current totals**: 211 tests, all failing: server 186, web 25. Typecheck exits 0.
- **Plan conflicts**: bugs marked `[conflicts with plan]` contradict a plan document, so the human
  decides the expected behavior before implementation.

- Bug B1: ran root `bun run dev` in the background, then sent SIGTERM to its pid → bun reported "terminated by signal SIGTERM", but `node --watch src/main.ts` and Vite were reparented to PID 1 and Vite kept listening on :5174 until killed by pid → expected: stopping dev stops every child (quickstart check 7 "stop bun run dev, start it again" for FR-017/SC-006; tasks.md T010 "Stop every server you started") [no test: process lifecycle of the root dev script]
- Bug B2: ran `PORT=4000 bun run --cwd web dev` with a stand-in API on :4000 → POST /api/links through Vite got 502 text/plain, because the proxy still targets :3000 → expected per quickstart (PORT is an optional setting for `bun run dev`) and FR-018 (the page uses the API) [conflicts with plan: research R14 and tasks.md T001 hard-code the proxy target http://localhost:3000] [no test: dev-server config; web tests stub fetch]
- Bug B3: traced the default DB_PATH through the planned wiring (main.ts passes config.dbPath to openLinkRepository) for a start from a cwd other than server/ → no test in the suite fails for this; config.test.ts only pins the string 'data/links.db' and startup.test.ts always uses cwd server/ with an explicit DB_PATH, so the server would open a new, empty <cwd>/data/links.db where old links 404 and their codes can be issued again → expected per FR-017, FR-004, research R13 (default "relative to server/") [no test: it would have to start the server without DB_PATH, which writes the real server/data/links.db]
- Bug B4: sent lifetime "constructor", "toString", "__proto__", "hasOwnProperty", ["7d"], ["never"], " 7d", "7d\n" → no test in the suite fails for this; expiration.test.ts BAD_LIFETIMES (null, "", "2h", "1H", 3600, true) are all still rejected by a plain-object lookup, a trimming lookup, or Fastify's default body schema (which coerces ["7d"] to "7d") → expected per AC US2-5, FR-011, FR-012: 400 INVALID_LIFETIME, no link
- Bug B5: submitted "  HTTPS://EXAMPLE.COM:443/./a…a\t\n " whose normalized form is exactly 2,048 characters (raw 2,059) → no test in the suite fails for this; the 2,048/2,049 tests use input that is already normalized, so an extra raw-length check passes → expected per FR-002, A-03: accepted and stored as the 2,048-character normalized URL
- Bug B6: submitted "https://", "http://", "https://exa mple.com", " https://example.com" → no test in the suite fails for this; MISSING_SCHEME is only tested on scheme-less input and INVALID_URL only on "not a url", and the plan's rule answers all four with "Add https:// to the start…" although they already start with it → expected per AC US1-4, SC-004: 400 INVALID_URL [conflicts with plan: data-model.md validation rule 3 / research R7 step 3; 'https://' + input parses with host "https"]
- Bug B7: submitted "httpx://example.com", "http+unix://example.com", "https-proxy://example.com" → no test in the suite fails for this; the scheme tests only use javascript:, ftp: and mailto:, so `protocol.startsWith('http')` passes → expected per AC US1-4, FR-002: 400 UNSUPPORTED_SCHEME
- Bug B8: submitted http://localhost, http://192.168.1.1/admin, http://127.0.0.1:3000/x, http://[::1]:8080/ → no test in the suite fails if these are rejected; every accepted URL in the suite has a public dotted host, so an "SSRF guard" passes → expected per FR-002, A-13, spec "Other inputs": 201, then 302 to the normalized URL
- Bug B9: issued AAAAAAAA, then opened /AAAAAAAA/, /AAAAAAAA. and /AAAAAAAAB → no test in the suite fails if these redirect; routes.test.ts tries /abc12345/ only for a never-issued code, so ignoreTrailingSlash or an unanchored code regex passes → expected per FR-009, http-api.md (a path that isn't 8 letters and digits → 404), spec "Other inputs": the 404 page
- Bug B10: sent HEAD /{code} for an active, an expired and an unknown code → no test in the suite fails for this; no test sends HEAD, so exposeHeadRoutes: false (HEAD on an active link → 404) passes → expected per http-api.md ("HEAD returns the same status and headers, with no body"), FR-008, FR-013
- Bug B11: POSTed JSON with content type "application/json; charset=utf-8" or "Application/JSON" → no test in the suite fails if these get 415; every JSON request in the suite sends exactly "application/json", so an exact-string JSON-only check passes → expected per http-api.md (415 only when the type isn't application/json), FR-018: 201
- Bug B12: made an unexpected error happen inside POST (createTestApp({ codes: [] }) makes the generator throw) → no test in the suite fails for this; no test reaches the error handler's "anything else" branch, so answering 500 with error.message ("fixedCodes: out of codes") passes → expected per http-api.md, research R11: 500 INTERNAL_ERROR "Something went wrong. Try again." (or STORAGE_ERROR), no internals
- Bug B13: created 1h, 30d and never links on a file database, reopened it with a new service 2 h later, then 100 years later → no test in the suite fails for this; link-repository.test.ts checks only stored fields after reopening and the expiry tests use one in-process service, so keeping expiry in an in-memory Map passes → expected per SC-006, FR-017, AC US2-3, AC US2-7: the expired link stays 404, active links still redirect
- Bug B14: opened a non-SQLite file, and a DB_PATH whose parent folder can't be created, via openLinkRepository and `node src/main.ts` → no test in the suite fails for this; only the open (errcode 14) and the PRAGMA write (errcode 8) are made to fail, so try/catch around just those passes while CREATE TABLE (errcode 26) and mkdir (EACCES/EEXIST) escape as raw errors → expected per FR-022, research R12 ("if any step fails… exits with code 1"): StorageError, exit 1 naming storage
- Bug B15: generated 2,000 codes and counted the symbols in each position → no test in the suite fails for this; only /^[A-Za-z0-9]{8}$/ and SC-005 uniqueness are checked, which `Math.random().toString(36).slice(2, 10)` (lowercase and digits) passes → expected per FR-006, D3, the spec's "about 2×10^14" codes (62^8, research R6): all 62 symbols in every position
- Bug B16: started `node src/main.ts` on a free port and connected via 127.0.0.1, ::1 and the LAN IPv4 address → no test in the suite fails for this; no test starts the server successfully, so host '0.0.0.0' (reachable from the network) or '127.0.0.1' (::1 refused) passes → expected per http-api.md ("listens on localhost only, covering both loopback addresses"), research R13, A-11, Q3
- Bug B17: in the UI, got a result, then a 400/500 on the next submit; separately, copied link 1, then created link 2 → no test in the suite fails for this; App.test.tsx checks errors only on a fresh page and only error → success, so a kept result or a sticky "Copied" passes → expected per contracts/web-ui.md (Error state: "No result is shown"; Copy reads "Copied" after copying that link)
- Bug B18: posted through the Vite proxy with the API down → the proxy answered 502 text/plain with an empty body, so fetch resolves; no test in the suite covers a non-JSON failure, and an api.ts that reads response.json().error.message passes the suite but throws here, leaving no message → expected per contracts/web-ui.md (Network failure: "Couldn't reach the service. Try again."), SC-004 [conflicts with plan: tasks.md "Module interfaces" (web/src/api.ts) maps only a rejected fetch to that message and every other failure to error.message]
- Bug B19: made fetch reject, then retried → no test in the suite fails for this; "re-enables the Shorten button" covers only a 400, so an App that resets "Shortening…" only on the non-throwing path passes and the button stays disabled → expected per contracts/web-ui.md (Submitting only while in flight; the Network failure message says "Try again.")
- Bug B20: typed a URL and pressed Enter → no test in the suite fails for this; every test clicks Shorten, so a page without a <form> (button onClick) passes and Enter does nothing → expected per contracts/web-ui.md (Shorten "Submits the form"), FR-001, SC-001
- Bug B21: showed a result in a non-UTC time zone → no test in the suite fails for this; Vitest runs with TZ=UTC, so an App that formats with timeZone: 'UTC' passes → expected per FR-014 ("in the viewer's local time zone"), contracts/web-ui.md Success state

## 2026-11-20: Codex review (`gpt-6-luna`, max effort): Claude's proposed decisions

Codex reviewed the scaffold and T002–T005 tests read-only and reported 12 findings (C1–C12): 6 Important,
6 Minor. Claude agrees with all 12. Five are already covered by break-pass tests: C2 by B15, C3 by B13,
C5 by B21, C6 partly by B12, and C7 by B10. Nothing has been fixed: the human confirms first. Full
findings are in `.superpowers/sdd/tasks/codex-review.md`.

| Finding | Decision | Reason |
|---------|----------|--------|
| C1: no test that an expired link's code is never reused | Agree | FR-004 and A-08. A "delete expired rows" cleanup would pass today. No break test covers it. |
| C2: a sequential code counter would pass | Agree | FR-006. Already covered by B15 (all 62 symbols in every position). |
| C3: restart only checked at repository level | Agree | SC-006. Already covered by B13. |
| C4: no lifetime crosses a daylight-saving change | Agree | FR-012. All tests start on 1 January, so calendar-day arithmetic passes. |
| C5: UTC-only test time zone | Agree | FR-014. Already covered by B21. |
| C6: no test for `INTERNAL_ERROR` | Agree | R11. B12 also accepts `STORAGE_ERROR`; a stub service throwing a plain `Error` would pin it exactly. |
| C7: `HEAD` untested | Agree | HTTP contract. Already covered by B10. |
| C8: the 16 KiB limit is untested exactly at the limit, and ignoring extra fields is untested | Agree | HTTP contract. One exactly-16,384-byte body with an extra field covers both. |
| C9: UI 413 untested | Agree | The web-ui contract lists 413. Cheap; guards against status-specific handling. |
| C10: permission tests fail as root | Agree, low priority | Real, but only in a root container, which is outside the "local only" scope. A skip guard is enough. |
| C11: tabs and already-encoded URLs untested | Agree | The spec's edge cases list tabs. A decode-before-store bug would pass today. |
| C12: UI fixtures use a 7-character code, and `7d` returns `expiresAt: null` | Agree | Verified at `App.test.tsx:5` and `:126`. The fixtures contradict the contract; no behavior change needed. |

## 2026-11-20: Review decisions confirmed

**What the human said**:

1. Confirmed the Codex findings and asked for the missing tests.
2. Confirmed the recommendations for B2, B6 and B18.
3. Approved adding B1 and B3 to the plan.

**Changes**:

- Added tests for C1, C4, C6, C8, C9 and C11. C2, C3, C5 and C7 are covered by B15, B13, B21
  and B10. C10 skips permission-bit checks when tests run as root. C12's UI fixture now uses a valid
  eight-character code and a finite expiry for `7d`.
- Applied B2 in `web/vite.config.ts`; the proxy target reads the server's `PORT` (default `3000`).
- The approved plan updates for B1 and B3 are in `quickstart.md` and `tasks.md`. The approved B6 and
  B18 rules are in `data-model.md`, `research.md` and the UI contract.

**Gate 3 status**: The new tests and approved setup change are ready for human review. No server or UI
feature implementation has started.

**Verification**: `bun run typecheck` passed for both packages, and `git diff --check` passed. `bun run
test` exits 1 as expected for the RED scaffold: 192 server tests and 26 web tests fail against the
placeholder implementation.

## 2026-11-20: Gate 4 triage

The final whole-change review found no Critical or Important issues. The human approved these
follow-ups:

- A request with no body returns `400 INVALID_REQUEST` even if it has a non-JSON `Content-Type`.
  A present body with a non-JSON or missing content type returns `415 INVALID_REQUEST`.
- Update the plan and research notes to show that SC-007 has an automated test and a manual check,
  and document the route-level JSON content-type guard used by the server.
- Keep SC-001 marked unverified until a first-time user completes the timed check.

The final reviewer accepted the T009 pre-implementation test evidence from the prior root test run.

**Gate 4 fixes completed**: the server now returns `400 INVALID_REQUEST` for a bodyless request even
when it has a non-JSON `Content-Type`; a present non-JSON body still gets `415`. A regression test
covers bodyless `text/plain`. The HTTP contract, R11 JSON-only decision and SC-007 notes in the plan
and research now match implementation and tests. SC-001 remains unverified until a first-time user
completes its timed check. The scoped re-review passed all four findings; root tests pass 220/220 and
both package typechecks pass.

## What I'd do differently

TODO: Complete this section.

## How this scales

TODO: Complete this section.
