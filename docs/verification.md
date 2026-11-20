# HTTP acceptance verification

Run on 2026-11-20 with Node.js v26.0.0 and Bun 1.3.10. The API used port 43456 and an isolated SQLite database at `/tmp/url-shortener-verification.CF0EuG/links.db`. The Vite page used port 43457 and proxied `/api` to port 43456. Port 5173 was not used.

The 12 acceptance scenarios below are the five scenarios in US1 and seven in US2 from [the feature spec](../specs/001-url-shortener/spec.md). Sections are grouped by AC, not by command execution time. Each transcript records the command and output returned during this run. The database was changed only to simulate elapsed time for the expiry checks; these mutations are identified where used.

`curl` verifies HTTP responses and the API data consumed by the UI. It cannot verify that a person sees the rendered result, uses the Copy button, or sees a local-time rendering. The UI-only portions are marked in the scenario list.

## Start and stop

Create the isolated database directory:

```console
$ mktemp -d /tmp/url-shortener-verification.XXXXXX
/tmp/url-shortener-verification.CF0EuG
```

Start the API in one terminal:

```console
$ PORT=43456 BASE_URL=http://localhost:43456 DB_PATH=/tmp/url-shortener-verification.CF0EuG/links.db bun run --cwd server start
$ node src/main.ts
{"level":30,"time":1795192244372,"pid":2455,"hostname":"Hermans-MacBook-Pro.local","msg":"Server listening at http://[::1]:43456"}
{"level":30,"time":1795192244373,"pid":2455,"hostname":"Hermans-MacBook-Pro.local","msg":"Server listening at http://127.0.0.1:43456"}
```

Start the UI in a second terminal:

```console
$ PORT=43456 bun run --cwd web dev -- --host localhost --port 43457 --strictPort
$ vite --host localhost --port "43457" --strictPort

  VITE v8.3.8  ready in 255 ms

  ➜  Local:   http://localhost:43457/
```

After the checks, I sent `Ctrl+C` to both process sessions. Each exec session exited with status 130; the Vite session had no shutdown output. I checked that ports 43456 and 43457 had no remaining listeners. The temporary database directory was then removed. To clean up a new run, use `rm -rf "$VERIFY_DIR"` only after setting `VERIFY_DIR` to the directory created for that run.

## US1 — Shorten a URL and share it

### US1 AC1 — Create and display a short link

The UI page returned 200. A create request through Vite's `/api` proxy returned a full short URL and expiration data. The HTTP evidence cannot verify that the React page rendered the URL or that its Copy button works.

```console
$ curl -sS -o /dev/null -w 'HTTP_STATUS=%{http_code} CONTENT_TYPE=%{content_type}\n' http://localhost:43457/ && curl -sS -X POST http://localhost:43457/api/links -H 'content-type: application/json' -d '{"url":"https://example.com/from-web-proxy"}' -w '\nHTTP_STATUS=%{http_code}\n'
HTTP_STATUS=200 CONTENT_TYPE=text/html
{"code":"h50b2iJE","shortUrl":"http://localhost:43456/h50b2iJE","expiresAt":"2026-11-21T16:32:33.101Z"}
HTTP_STATUS=201
```

The following direct create request generated the link used for the normalized redirect in US1 AC2 and the default-lifetime check in US2 AC6:

```console
$ curl -sS -X POST http://localhost:43456/api/links -H 'content-type: application/json' -d '{"url":"  HTTPS://Example.COM/path?a=1#frag  "}' -w '\nHTTP_STATUS=%{http_code}\n'
{"code":"7jSEsQyo","shortUrl":"http://localhost:43456/7jSEsQyo","expiresAt":"2026-11-21T16:30:58.772Z"}
HTTP_STATUS=201
```

### US1 AC2 — Redirect to the normalized URL, including query and fragment

```console
$ curl -sS -D - -o /dev/null -w 'HTTP_STATUS=%{http_code}\n' 'http://localhost:43456/7jSEsQyo?ignored=yes'
HTTP/1.1 302 Found
cache-control: no-store
location: https://example.com/path?a=1#frag
content-length: 0
Date: Fri, 20 Nov 2026 16:31:04 GMT
Connection: keep-alive
Keep-Alive: timeout=72

HTTP_STATUS=302
```

The destination came from a submitted value with surrounding spaces and uppercase host/scheme. The query and fragment remained in the redirect. The query on the short URL was ignored.

### US1 AC3 — Submitting the same URL creates two working links

```console
$ curl -sS -X POST http://localhost:43456/api/links -H 'content-type: application/json' -d '{"url":"https://example.com/repeated"}' -w '\nHTTP_STATUS=%{http_code}\n' && curl -sS -X POST http://localhost:43456/api/links -H 'content-type: application/json' -d '{"url":"https://example.com/repeated"}' -w '\nHTTP_STATUS=%{http_code}\n'
{"code":"GxfNU0wA","shortUrl":"http://localhost:43456/GxfNU0wA","expiresAt":"2026-11-21T16:31:11.077Z"}
HTTP_STATUS=201
{"code":"mY2dUMx7","shortUrl":"http://localhost:43456/mY2dUMx7","expiresAt":"2026-11-21T16:31:11.090Z"}
HTTP_STATUS=201
```

```console
$ curl -sS -D - -o /dev/null -w 'HTTP_STATUS=%{http_code}\n' http://localhost:43456/GxfNU0wA && curl -sS -D - -o /dev/null -w 'HTTP_STATUS=%{http_code}\n' http://localhost:43456/mY2dUMx7
HTTP/1.1 302 Found
cache-control: no-store
location: https://example.com/repeated
content-length: 0
Date: Fri, 20 Nov 2026 16:31:15 GMT
Connection: keep-alive
Keep-Alive: timeout=72

HTTP_STATUS=302
HTTP/1.1 302 Found
cache-control: no-store
location: https://example.com/repeated
content-length: 0
Date: Fri, 20 Nov 2026 16:31:15 GMT
Connection: keep-alive
Keep-Alive: timeout=72

HTTP_STATUS=302
```

### US1 AC4 — Reject invalid URLs with a repair message

The API returned 400 and a reason for empty, malformed, missing-scheme, JavaScript-scheme, and FTP-scheme input. `curl` does not show how the web page renders those messages.

```console
$ curl -sS -X POST http://localhost:43456/api/links -H 'content-type: application/json' -d '{"url":""}' -w '\nHTTP_STATUS=%{http_code}\n' && curl -sS -X POST http://localhost:43456/api/links -H 'content-type: application/json' -d '{"url":"http://"}' -w '\nHTTP_STATUS=%{http_code}\n' && curl -sS -X POST http://localhost:43456/api/links -H 'content-type: application/json' -d '{"url":"example.com"}' -w '\nHTTP_STATUS=%{http_code}\n' && curl -sS -X POST http://localhost:43456/api/links -H 'content-type: application/json' -d '{"url":"javascript:alert(1)"}' -w '\nHTTP_STATUS=%{http_code}\n' && curl -sS -X POST http://localhost:43456/api/links -H 'content-type: application/json' -d '{"url":"ftp://example.com/file"}' -w '\nHTTP_STATUS=%{http_code}\n'
{"error":{"code":"URL_REQUIRED","message":"Enter a URL to shorten."}}
HTTP_STATUS=400
{"error":{"code":"INVALID_URL","message":"This is not a valid URL. Check it and try again."}}
HTTP_STATUS=400
{"error":{"code":"MISSING_SCHEME","message":"Add https:// to the start, for example https://example.com."}}
HTTP_STATUS=400
{"error":{"code":"UNSUPPORTED_SCHEME","message":"Only http:// and https:// URLs can be shortened."}}
HTTP_STATUS=400
{"error":{"code":"UNSUPPORTED_SCHEME","message":"Only http:// and https:// URLs can be shortened."}}
HTTP_STATUS=400
```

### US1 AC5 — An unknown code returns not found without redirecting

```console
$ curl -sS -i http://localhost:43456/zzzzzzzz
HTTP/1.1 404 Not Found
cache-control: no-store
content-type: text/html; charset=utf-8
content-length: 67
Date: Fri, 20 Nov 2026 16:31:27 GMT
Connection: keep-alive
Keep-Alive: timeout=72

<!doctype html><title>Link not found</title><h1>Link not found</h1>
```

## US2 — Give a short link a lifetime

### US2 AC1 — The chosen lifetime is returned with the link

An explicit 1-hour lifetime returned both the short URL and an ISO expiration timestamp. The UI's visual formatting is outside what this curl check can establish.

```console
$ curl -sS -X POST http://localhost:43456/api/links -H 'content-type: application/json' -d '{"url":"https://example.net/before-expiry","lifetime":"1h"}' -w '\nHTTP_STATUS=%{http_code}\n'
{"code":"2DdBVLn6","shortUrl":"http://localhost:43456/2DdBVLn6","expiresAt":"2026-11-20T17:31:32.342Z"}
HTTP_STATUS=201
```

### US2 AC2 — A link redirects before its expiration time

```console
$ curl -sS -D - -o /dev/null -w 'HTTP_STATUS=%{http_code}\n' http://localhost:43456/2DdBVLn6
HTTP/1.1 302 Found
cache-control: no-store
location: https://example.net/before-expiry
content-length: 0
Date: Fri, 20 Nov 2026 16:31:35 GMT
Connection: keep-alive
Keep-Alive: timeout=72

HTTP_STATUS=302
```

### US2 AC3 — An expired link has the same 404 response as an unknown code

To avoid waiting an hour, the expiry in the isolated verification database was moved into the past. This is setup for the HTTP check, not a curl request.

```console
$ node --input-type=module -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("/tmp/url-shortener-verification.CF0EuG/links.db"); const result = db.prepare("UPDATE links SET expires_at = ? WHERE code = ?").run(Date.now() - 1, "2DdBVLn6"); console.log(`updated_rows=${result.changes}`); db.close();'
updated_rows=1
```

```console
$ curl -sS -o - -w '\nHTTP_STATUS=%{http_code}\n' http://localhost:43456/2DdBVLn6 && curl -sS -o - -w '\nHTTP_STATUS=%{http_code}\n' http://localhost:43456/zzzzzzzz
<!doctype html><title>Link not found</title><h1>Link not found</h1>
HTTP_STATUS=404
<!doctype html><title>Link not found</title><h1>Link not found</h1>
HTTP_STATUS=404
```

The bodies and status codes matched. The automated test suite provides the exact-at-the-boundary clock check; this HTTP transcript checks an expiry already in the past.

### US2 AC4 — A previously working link stops redirecting after expiry

The link returned 302 at 16:31:35 UTC in US2 AC2. After its stored expiration was advanced past the service clock, a later request returned 404:

```console
$ curl -sS -D - -o /dev/null -w 'HTTP_STATUS=%{http_code}\n' http://localhost:43456/2DdBVLn6
HTTP/1.1 404 Not Found
cache-control: no-store
content-type: text/html; charset=utf-8
content-length: 67
Date: Fri, 20 Nov 2026 16:33:15 GMT
Connection: keep-alive
Keep-Alive: timeout=72

HTTP_STATUS=404
```

### US2 AC5 — Reject a lifetime outside the allowed list without saving a link

The response lists the allowed lifetime values. The row count in the isolated database was unchanged by this rejected request. At this point, the four rows were `7jSEsQyo`, `GxfNU0wA`, `mY2dUMx7`, and `2DdBVLn6`. The separate Vite-proxy create for `h50b2iJE`, shown earlier under US1 AC1, ran later in the same session (the server log records it at 16:32:33.100Z). It used the same API process and database, so it was not part of this earlier count.

```console
$ node --input-type=module -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("/tmp/url-shortener-verification.CF0EuG/links.db"); console.log(`rows_before=${db.prepare("SELECT COUNT(*) AS count FROM links").get().count}`); db.close();' && curl -sS -X POST http://localhost:43456/api/links -H 'content-type: application/json' -d '{"url":"https://example.com","lifetime":"2h"}' -w '\nHTTP_STATUS=%{http_code}\n' && node --input-type=module -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("/tmp/url-shortener-verification.CF0EuG/links.db"); console.log(`rows_after=${db.prepare("SELECT COUNT(*) AS count FROM links").get().count}`); db.close();'
rows_before=4
{"error":{"code":"INVALID_LIFETIME","message":"Lifetime must be one of: 1h, 24h, 7d, 30d, never."}}
HTTP_STATUS=400
rows_after=4
```

### US2 AC6 — An omitted lifetime defaults to 24 hours

The initial create request in US1 AC1 omitted `lifetime`. Its stored expiration was exactly 86,400,000 milliseconds after its stored creation time, and it redirected while active:

```console
$ node --input-type=module -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("/tmp/url-shortener-verification.CF0EuG/links.db"); const row = db.prepare("SELECT created_at AS createdAt, expires_at AS expiresAt, expires_at - created_at AS lifetimeMs FROM links WHERE code = ?").get("7jSEsQyo"); console.log(JSON.stringify(row)); db.close();' && curl -sS -D - -o /dev/null -w 'HTTP_STATUS=%{http_code}\n' http://localhost:43456/7jSEsQyo
{"createdAt":1795192258772,"expiresAt":1795278658772,"lifetimeMs":86400000}
HTTP/1.1 302 Found
cache-control: no-store
location: https://example.com/path?a=1#frag
content-length: 0
Date: Fri, 20 Nov 2026 16:32:07 GMT
Connection: keep-alive
Keep-Alive: timeout=72

HTTP_STATUS=302
```

### US2 AC7 — Never-expiring link has no expiry and continues redirecting

The response showed `expiresAt: null`. To check behavior for a much older link without waiting, the isolated database's `created_at` was moved 100 years into the past while leaving `expires_at` null. The link still returned 302. This accelerates the setup; it does not measure 100 years of elapsed wall time.

```console
$ curl -sS -X POST http://localhost:43456/api/links -H 'content-type: application/json' -d '{"url":"https://example.org/never","lifetime":"never"}' -w '\nHTTP_STATUS=%{http_code}\n'
{"code":"KinFPNMj","shortUrl":"http://localhost:43456/KinFPNMj","expiresAt":null}
HTTP_STATUS=201
```

```console
$ node --input-type=module -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("/tmp/url-shortener-verification.CF0EuG/links.db"); const result = db.prepare("UPDATE links SET created_at = ? WHERE code = ?").run(Date.now() - 100 * 365 * 24 * 60 * 60 * 1000, "KinFPNMj"); console.log(`updated_rows=${result.changes}`); const row = db.prepare("SELECT created_at AS createdAt, expires_at AS expiresAt FROM links WHERE code = ?").get("KinFPNMj"); console.log(JSON.stringify(row)); db.close();' && curl -sS -D - -o /dev/null -w 'HTTP_STATUS=%{http_code}\n' http://localhost:43456/KinFPNMj
updated_rows=1
{"createdAt":-1358407656815,"expiresAt":null}
HTTP/1.1 302 Found
cache-control: no-store
location: https://example.org/never
content-length: 0
Date: Fri, 20 Nov 2026 16:32:23 GMT
Connection: keep-alive
Keep-Alive: timeout=72

HTTP_STATUS=302
```
