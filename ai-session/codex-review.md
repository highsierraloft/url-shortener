# RED Phase Review

## Findings

### C1 — Important

- **File:** `server/tests/link-service.test.ts:195`
- **Finding:** The forced collision tests use a code that is still active. No test collides with a code after its link expires, so an implementation that deletes expired rows and reuses their codes can pass.
- **Evidence:** FR-004 requires codes to remain unique across expired links and never be reassigned; the spec repeats this in Edge Cases, and `data-model.md` says rows are never deleted.
- **Suggested fix:** Expire a link, then force the generator to return its code and assert allocation retries without changing the old destination.

### C2 — Important

- **File:** `server/tests/link-service.test.ts:169`
- **Finding:** The generator checks only code shape and uniqueness across 10,000 links. A sequential base-62 counter would satisfy both and pass, despite violating the random-generation requirement.
- **Evidence:** FR-006 requires random, non-sequential codes; research R6 selects `crypto.randomInt`.
- **Suggested fix:** Add a deterministic regression that rejects sequential allocation or verifies the planned random source through a controlled test.

### C3 — Important

- **File:** `server/tests/link-repository.test.ts:68`
- **Finding:** The restart test checks that repository fields survive close and reopen, but never resolves an active or expired link through a reopened service. Production wiring that uses fresh in-memory storage could pass the repository and service tests.
- **Evidence:** FR-017 requires links and expiry to survive restart; SC-006 requires both active and expired links to behave the same afterward. Quickstart check 7 manually checks only an active link.
- **Suggested fix:** Add a file-backed service restart test that checks an active redirect and an expired 404 after reopening.

### C4 — Important

- **File:** `server/tests/expiration.test.ts:10`
- **Finding:** All duration cases start on January 1, so calendar-day arithmetic can pass without crossing a daylight-saving change. The tests therefore do not catch lifetimes that are one hour short or long across DST.
- **Evidence:** FR-012 and the spec's DST edge case require exact durations unaffected by daylight-saving changes.
- **Suggested fix:** Test a 7-day or 30-day lifetime across a DST boundary in a fixed non-UTC test timezone.

### C5 — Important

- **File:** `web/tests/App.test.tsx:184`; `web/vite.config.ts:11`
- **Finding:** The expiry expectation uses the default local formatter, but the test environment is fixed to UTC. A UI that always formats in UTC will pass, even though FR-014 requires the viewer's local timezone.
- **Evidence:** FR-014 and research R9 require local-time display; the configured test timezone is UTC.
- **Suggested fix:** Run a display case in a non-UTC timezone and assert the viewer-local formatted time.

### C6 — Important

- **File:** `server/tests/routes.test.ts:139`
- **Finding:** No route test makes the service throw an unexpected error. An error handler that leaks Fastify's default 500 response instead of returning the contract's `INTERNAL_ERROR` body can pass the suite.
- **Evidence:** `http-api.md` requires 500 `INTERNAL_ERROR` for unexpected failures; research R11 maps all other failures to that response.
- **Suggested fix:** Inject a service that throws a plain `Error` and assert the exact status, code, and message.

### C7 — Minor

- **File:** `server/tests/routes.test.ts:72`
- **Finding:** The API contract says `HEAD` has the same status and headers as `GET`, with no body, but no test covers it.
- **Evidence:** `contracts/http-api.md` lines 80–83.
- **Suggested fix:** Add `HEAD` checks for an active code and an unknown code, comparing status and headers and asserting an empty body.

### C8 — Minor

- **File:** `server/tests/routes.test.ts:166`
- **Finding:** The body-limit test checks only a request larger than 16 KiB. It does not prove that exactly 16 KiB is accepted or that extra JSON fields are ignored; a lower limit or strict unknown-field rejection would pass.
- **Evidence:** `contracts/http-api.md` lines 17, 28, and 63 set a 16 KiB inclusive limit and say extra fields are ignored.
- **Suggested fix:** Submit a valid 16 KiB JSON object with an extra field and assert successful creation.

### C9 — Minor

- **File:** `web/tests/App.test.tsx:223`
- **Finding:** The UI tests cover 400 and 500 errors but omit 413, although the UI contract requires displaying the server message for 413 responses too.
- **Evidence:** `contracts/web-ui.md` line 25 and `contracts/http-api.md` line 63.
- **Suggested fix:** Add a 413 response case and assert its exact message appears in the alert with no result.

### C10 — Minor

- **File:** `server/tests/link-repository.test.ts:88`; `server/tests/startup.test.ts:45`
- **Finding:** The read-only tests rely on `chmod` mode bits (`0444` and `0555`). Those bits do not prevent a root process from writing, so these assertions can fail under a root-run test environment even when the storage is writable to that process.
- **Evidence:** The tests assert storage failure solely from those permission bits; this review's `id -u` probe returned `501`, so the current run does not exercise the root case.
- **Suggested fix:** Use a failure fixture that is unwritable to the test process, or skip these permission assertions when the effective user is root.

### C11 — Minor

- **File:** `server/tests/link-service.test.ts:135`
- **Finding:** The normalization cases cover spaces, backslashes, newlines, and non-ASCII text, but omit tabs and already percent-encoded input. A parser that mishandles either can pass these tests.
- **Evidence:** The spec's URL edge cases explicitly include tabs and percent-encoding; FR-019 requires WHATWG normalization.
- **Suggested fix:** Add a tab-containing URL and a URL with a reserved percent-encoded character, then assert their normalized forms.

### C12 — Minor

- **File:** `web/tests/App.test.tsx:5`; `web/tests/App.test.tsx:126`
- **Finding:** The UI success fixture uses a 7-character code, and the test that selects `7d` returns `expiresAt: null`, which the API contract reserves for `never`. These impossible responses weaken the UI tests for valid server results.
- **Evidence:** `contracts/http-api.md` lines 42 and 44 require an 8-character code and a non-null expiry for finite lifetimes.
- **Suggested fix:** Use an 8-character code in the fixture and a non-null expiry in the `7d` case.

## Checked and found correct

- Read the constitution, feature spec, contracts, data model, research, and tasks in the requested order; reviewed only the listed scaffold and test files.
- Placeholder exports, `App` returning `null`, helper behavior, and module interfaces match the intended RED-phase state.
- The fake clock avoids sleeps; the validation messages, URL normalization examples, expiry boundaries, and 404 equivalence assertions align with the cited contracts.
- Root `bun run typecheck` exits 0. Root `bun run test` collects both suites and fails on the intentional placeholders. A Node URL probe confirmed the tested normalization for surrounding spaces, a backslash URL, an embedded newline, and non-ASCII path text.
