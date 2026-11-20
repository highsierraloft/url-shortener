# Process Log

Human interventions and review decisions (constitution, Development Workflow and Quality Gates).

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

### Open after Phase 1

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
