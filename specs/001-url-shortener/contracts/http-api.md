# Contract: HTTP API

This file is the documented programmatic interface required by FR-018. The web page uses exactly this
interface.

All short links start with `BASE_URL`, which defaults to `http://localhost:3000` (FR-020, research
R13). The server listens on `localhost` only, covering both loopback addresses. No endpoint requires
signing in (FR-016).

---

## `POST /api/links`: create a short link

### Request

- Header: `Content-Type: application/json`
- Body: a JSON object of at most 16 KiB (research R11)

```json
{ "url": "https://example.com/some/long/path?ref=mail#top", "lifetime": "7d" }
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `url` | string | yes | Read the way browsers read URLs (WHATWG URL Standard). Must be `http` or `https`, and at most 2,048 characters once normalized (FR-002). |
| `lifetime` | string | no | One of `"1h"`, `"24h"`, `"7d"`, `"30d"`, `"never"`. If omitted, it is `"24h"`. Any other value is rejected, including `null` and `""` (FR-011, FR-012). |

Any other fields are ignored.

### `201 Created`

```json
{
  "code": "aB3dE9xQ",
  "shortUrl": "http://localhost:3000/aB3dE9xQ",
  "expiresAt": "2026-11-27T10:15:30.123Z"
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `code` | string | 8 letters and digits; case-sensitive |
| `shortUrl` | string | `BASE_URL` + `/` + `code` (FR-007, FR-020) |
| `expiresAt` | string or `null` | The moment the link expires, as an ISO 8601 UTC time with milliseconds. It is `null` when the lifetime is `"never"` (FR-007, FR-012, FR-014). |

The service sends this response only after the link has been saved to disk (FR-021).

### Errors

Every error uses this body: `{ "error": { "code": "<CODE>", "message": "<text for people>" } }`.
No link is created in any of these cases.

| Status | `code` | When | `message` |
|--------|--------|------|-----------|
| 400 | `URL_REQUIRED` | `url` is absent, `""`, or only whitespace | `Enter a URL to shorten.` |
| 400 | `INVALID_URL` | `url` is present but isn't a string (including `null`), or can't be read as a URL | `This is not a valid URL. Check it and try again.` |
| 400 | `MISSING_SCHEME` | `url` has no scheme, and would be valid with `https://` added (for example `example.com`) | `Add https:// to the start, for example https://example.com.` |
| 400 | `UNSUPPORTED_SCHEME` | The scheme isn't `http` or `https` (for example `javascript:`, `ftp:`, `mailto:`) | `Only http:// and https:// URLs can be shortened.` |
| 400 | `URL_TOO_LONG` | The normalized URL is longer than 2,048 characters | `This URL is longer than 2,048 characters once encoded.` |
| 400 | `INVALID_LIFETIME` | `lifetime` is present but isn't one of the allowed values | `Lifetime must be one of: 1h, 24h, 7d, 30d, never.` |
| 400 | `INVALID_REQUEST` | Malformed or empty JSON, the body isn't a JSON object, or there is no body (even with a non-JSON `Content-Type`) | `Send a JSON object with a "url" field.` |
| 415 | `INVALID_REQUEST` | A present body whose content type isn't `application/json`, including a present body sent without a content type. Only JSON is accepted. | `Send a JSON object with a "url" field.` |
| 413 | `PAYLOAD_TOO_LARGE` | The body is larger than 16 KiB | `The request is too large.` |
| 500 | `STORAGE_ERROR` | The link couldn't be saved, or all 5 code attempts collided | `The link couldn't be saved. Try again.` |
| 500 | `INTERNAL_ERROR` | Any other unexpected failure | `Something went wrong. Try again.` |

### Examples

| Request body | Result |
|--------------|--------|
| `{"url":"  HTTPS://Example.COM  "}` | `201`; the link redirects to `https://example.com/` and expires 24 h after creation |
| `{"url":"https://example.com","lifetime":"never"}` | `201` with `"expiresAt": null` |
| `{"url":"example.com"}` | `400 MISSING_SCHEME` |
| `{"url":"javascript:alert(1)"}` | `400 UNSUPPORTED_SCHEME` |
| `{"url":"https://example.com","lifetime":null}` | `400 INVALID_LIFETIME` |
| `{"url":"https://example.com","lifetime":"2h"}` | `400 INVALID_LIFETIME` |

---

## `GET /{code}`: follow a short link

`HEAD` returns the same status and headers, with no body.

### Active link → `302 Found`

```http
HTTP/1.1 302 Found
Location: https://example.com/some/long/path?ref=mail#top
Cache-Control: no-store
```

- `Location` is the stored, normalized URL (FR-008, FR-019).
- Any query string on the short link itself is ignored.
- The redirect is temporary and may not be cached (FR-010, research R10).

### Anything else → `404 Not Found`

This covers:

- an unknown code
- an expired link (FR-013)
- a path that isn't 8 letters and digits
- any address the server doesn't recognize

```http
HTTP/1.1 404 Not Found
Content-Type: text/html; charset=utf-8
Cache-Control: no-store
```

The body is the same fixed, small HTML page with the text "Link not found" in every case. A visitor
can't tell an expired link from one that never existed (FR-009, FR-013).
