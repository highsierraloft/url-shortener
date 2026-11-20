# Data Model: URL Shortener

**Date**: 2026-11-20 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

## Entity: Short link (table `links`)

There is one table. Rows are only ever inserted. They are never updated (FR-015) and never deleted
(FR-004, A-08).

| Column | Type | Rules | Spec |
|--------|------|-------|------|
| `code` | `TEXT PRIMARY KEY` | Exactly 8 characters from `[A-Za-z0-9]`; case-sensitive; random; never reused | FR-003, FR-004, FR-006, research R6 |
| `url` | `TEXT NOT NULL` | The normalized (WHATWG) `href`, ASCII only; scheme `http` or `https`; at most 2,048 characters | FR-002, FR-019, research R7 |
| `created_at` | `INTEGER NOT NULL` | Milliseconds since the Unix epoch, UTC, read from the service clock | FR-012, FR-013, research R9 |
| `expires_at` | `INTEGER` (nullable) | `created_at` plus the lifetime in milliseconds; `NULL` means the link never expires | FR-011, FR-012, FR-015 |

```sql
CREATE TABLE IF NOT EXISTS links (
  code       TEXT    PRIMARY KEY,
  url        TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
```

The **lifetime** in the spec's Key Entities is not stored as its own column. `expires_at` captures it:
it is `NULL` for "never", and `expires_at − created_at` for the other lifetimes. No behavior needs to
read the lifetime back.

## Lifetimes

| API value | Label on the web page | Duration (ms) | Spec |
|-----------|-----------------------|---------------|------|
| `1h` | 1 hour | 3,600,000 | FR-012 |
| `24h` (default when omitted) | 24 hours | 86,400,000 | FR-011, FR-012 |
| `7d` | 7 days | 604,800,000 (168 h) | FR-012, D6 |
| `30d` | 30 days | 2,592,000,000 (720 h) | FR-012, D6 |
| `never` | Never | none; `expires_at` is `NULL` | FR-011 |

## Validation rules (create)

The service checks these in order and stops at the first failure. Each failure is a `ValidationError`
with a code and a message ([contracts/http-api.md](./contracts/http-api.md) lists the exact messages).

1. `url` is absent, `""`, or only whitespace → `URL_REQUIRED`.
2. `url` is present but not a string, including `null` → `INVALID_URL`.
3. `new URL(url)` throws:
   - if the trimmed input already starts with a scheme (`/^[A-Za-z][A-Za-z0-9+.-]*:/`, for example
     `https://` on its own) → `INVALID_URL`, because adding `https://` is not the fix
   - else if `new URL('https://' + url.trim())` would parse → `MISSING_SCHEME`
   - otherwise → `INVALID_URL`
4. The protocol is not `http:` or `https:` → `UNSUPPORTED_SCHEME`.
5. `href.length > 2048` → `URL_TOO_LONG`.
6. `lifetime` is present but isn't one of the five values above (including `null` and `""`) →
   `INVALID_LIFETIME`.

The body must also be a JSON object. If it isn't, the error is `INVALID_REQUEST` (research R11).

## Code allocation

1. The service gets a code from the injected generator.
2. It inserts the row.
3. If the database reports a duplicate primary key (`errcode 1555`), it repeats from step 1, with up to
   5 attempts in total.
4. If every attempt collides, or the insert fails for any other reason, it throws `StorageError` and no
   link is returned (FR-021).

## States

```text
                 create (1h | 24h | 7d | 30d)               clock.now() >= expires_at
   (no row) ──────────────────────────────────► ACTIVE ─────────────────────────────► EXPIRED
                 create (never)
   (no row) ──────────────────────────────────► ACTIVE (forever: expires_at is NULL)
```

What a visitor gets when they open `/{code}` (FR-008, FR-009, FR-013):

| Situation | Result |
|-----------|--------|
| The path isn't 8 letters and digits | Not found (404) |
| No row has this code | Not found (404) |
| A row exists and is expired | Not found (404), identical to the row above |
| A row exists and is active | Redirect (302) to `url` |

There are no other transitions. Nothing changes a row's lifetime or ends a link early, and an expired
row stays in the table so that its code is never reused.

## Service dependencies (injected)

These are passed in by `main.ts`. Tests pass in fakes instead.

| Dependency | Shape | Production version | Test version |
|------------|-------|--------------------|--------------|
| Clock | `{ now(): number }` (epoch ms) | `Date.now()` | Fake clock with a time the test sets |
| Code generator | `() => string` | 8 × `crypto.randomInt(62)` over `[A-Za-z0-9]` | A queue of fixed codes, to force a collision |
| Repository | `insert(link)`, `findByCode(code)` | `node:sqlite`, file at `DB_PATH` | Same, on `:memory:` |
| Base address | `string` | `BASE_URL` from config | `http://short.test` |
