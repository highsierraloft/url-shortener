# URL Shortener Constitution

## Core Principles

### I. Simplicity First (YAGNI)

Build only what `spec.md` requires. Scale concerns (caching, sharding, key-generation services,
rate limiting) MUST be documented in the spec, not implemented. Every module, dependency and
abstraction MUST be traceable to an acceptance criterion.

Rationale: this is a small, time-boxed increment; unrequested complexity costs review time and
adds risk without adding value.

### II. Test-First (NON-NEGOTIABLE)

Every acceptance criterion MUST have an automated test that is written and seen failing before
the implementation exists. Work follows red → green → refactor. Time-dependent behavior MUST be
tested through an injected clock, never by sleeping.

Rationale: tests written first verify the spec, not the implementation's assumptions.

### III. The Spec Is the Single Source of Truth

No behavior may exist that is not described in `spec.md`. A behavior change MUST start as a spec
change approved by the human, before any code changes.

Rationale: keeps agents, code and reviewers aligned on one definition of "correct".

### IV. Tests Are Never Edited to Pass

A failing test MUST NOT be modified to make it pass. If a test looks wrong, work stops and the
human decides whether the test or the spec changes.

Rationale: a test edited to pass silently redefines the requirement.

### V. Decisions Are Recorded as ADRs

Every decision with real alternatives MUST be recorded as an ADR in `docs/adr/`, including the
rejected options and the reason each was rejected.

Rationale: makes trade-offs reviewable and stops settled decisions from being relitigated.

### VI. Clear Process Ownership

Spec Kit owns the specification phase: specify, clarify, plan, tasks, analyze. Superpowers owns
execution: git worktrees, subagent-driven development, TDD, code review and verification.
Superpowers `brainstorming` and `writing-plans` MUST NOT be used; the Spec Kit artifacts replace
them.

Rationale: two frameworks with overlapping planning steps would produce competing sources of
truth.

### VII. Verification Before Completion

Work is done only when all tests and the typecheck pass and the service has actually been run
against the acceptance criteria. Every claim of completion MUST cite the command output that
proves it.

Rationale: passing tests alone do not prove the service starts and behaves as specified.

## Technical Constraints

- Backend: Node.js with TypeScript. UI: React. These are fixed by the challenge brief.
- Package manager: bun only (never npm, yarn or pnpm).
- The app and its tests MUST run locally with bun commands only, without external services.
  Deployment is out of scope.
- Test scripts MUST run once and exit (`vitest run`), never in watch mode.

## Development Workflow and Quality Gates

- Four human gates: (1) spec approved; (2) plan, ADRs and tasks approved; (3) failing tests
  reviewed before any implementation; (4) review findings triaged, each one fixed or rejected
  with a reason.
- Each task is executed by a fresh subagent briefed with: goal, input files, the acceptance
  criteria it covers, constraints, definition of done and report format. After each task: a
  spec-compliance review, then a code-quality review.
- A final review by a different model checks the full diff against the spec and the ADRs.
- Human interventions and review decisions are logged in `PROCESS.md` as they happen.
- Commits follow Conventional Commits. The commit message is shown and approved before each
  commit.

## Governance

This constitution supersedes `CLAUDE.md` and default agent behavior; `CLAUDE.md` holds runtime
guidance only. Amendments require human approval, a version bump and a `PROCESS.md` entry
explaining the change. Versioning: MAJOR for removing or redefining a principle, MINOR for adding
a principle or section, PATCH for wording. Every review, per task and final, checks compliance
with these principles. Complexity not required by an acceptance criterion MUST be justified in an
ADR or removed.

**Version**: 1.0.0 | **Ratified**: 2026-11-19 | **Last Amended**: 2026-11-19
