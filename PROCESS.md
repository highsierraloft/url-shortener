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
