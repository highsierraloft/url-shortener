# Feature Specification: URL Shortener

**Feature Branch**: none (this project works directly on `main`; spec directory is `specs/001-url-shortener`)

**Created**: 2026-11-19

**Status**: Clarified, waiting for human approval of the spec (constitution gate 1)

**Input**: Customer request, verbatim:

> - Create short links from original URLs.
> - Redirect users from a short link to the original URL.
> - Set an expiration time for a short link.
>
> This is an initial request and needs clarification before implementation.

## Clarifications

### Session 2026-11-20

- Q: Is an expiration time required on every link, and what applies when none is given? → A: The
  customer wants expiration as a security measure. The creator chooses how long the link lives. Once a
  link has expired, it returns a 404 "not found" error.
- Q: Can a link's expiration be changed after creation, and if so, by whom? → A: No. It is set when
  the link is created and never changes.
- Q: Can anyone create short links without signing in, or only identified users? → A: Anyone, without
  signing in.
- Q: Must every short link expire, or can a creator choose to have their link never expire? → A: "Never
  expires" is one of the choices. The lifetime is 24 hours by default.
- Q: Which lifetimes can a creator choose: a fixed set of options, or any duration they type in? → A:
  A fixed list: 1 hour, 24 hours (default), 7 days, 30 days, never. Anything else is rejected.
- Q: Expiration stops a short link from working, but people who used the link keep the original URL.
  Should the service also protect destinations? → A: No, out of scope.
- Q: Should whoever runs the service be able to disable a harmful link, such as a phishing link that
  never expires? → A: No, out of scope.
- Q: Could the service ever be reachable publicly, where anonymous, unlimited, permanent links become
  an abuse risk? → A: Out of scope. The service runs locally only.

## User Scenarios & Testing *(mandatory)*

This spec has two roles:

- **Creator**: the person who turns a long URL into a short link.
- **Visitor**: anyone who opens a short link.

It also uses two time terms:

- **Lifetime**: how long a link stays active. The creator picks one of: 1 hour, 24 hours (the
  default), 7 days, 30 days, or never expires.
- **Expiration time**: the moment a link stops working, which is its creation time plus its lifetime.
  Links that never expire have no expiration time.

### User Story 1 - Shorten a URL and share it (Priority: P1)

A creator pastes a long URL into the service's web page and gets a short link back. They share it, and
anyone who opens it lands on the original page.

**Customer request covered**: "Create short links from original URLs" and "Redirect users from a short
link to the original URL".

**Why this priority**: This is the core of the product. Creating and redirecting only deliver value
together: a short link that doesn't redirect is useless, and nothing can be redirected until a link
has been created. So they form one story.

**Independent Test**: Submit a long URL, open the short link that comes back, and confirm the browser
ends up on the original URL.

**Acceptance Scenarios**:

1. **Given** a valid web address, **When** the creator submits it, **Then** the service returns a short
   link and displays it so it can be copied.
2. **Given** an active short link, **When** a visitor opens it, **Then** they arrive at the original URL
   in its normalized form (FR-019), including its query string and fragment.
3. **Given** a URL that has already been shortened, **When** a creator submits it again, **Then** they
   get a new, different short link, and both links work.
4. **Given** input that is not a valid `http` or `https` address (empty, malformed, missing its scheme,
   or using another scheme such as `javascript:` or `ftp:`), **When** the creator submits it, **Then**
   no link is created and the creator sees a message explaining what is wrong.
5. **Given** a short code that was never issued, **When** a visitor opens it, **Then** they see a
   "link not found" message and are not redirected.

---

### User Story 2 - Give a short link a lifetime (Priority: P2)

When creating a link, the creator picks how long it should live from a short list: 1 hour, 24 hours
(the default), 7 days, 30 days, or never expires. Until the lifetime runs out, the link redirects
normally. From then on, the link behaves as if it never existed: visitors get "not found".

**Customer request covered**: "Set an expiration time for a short link". The customer treats
expiration as a security measure (Clarifications, 2026-11-20).

**Why this priority**: The customer asked for it explicitly, but it depends on Story 1: there is
nothing to expire until short links exist.

**Independent Test**: Create a link with a lifetime. With a controllable clock, open it one second
before its expiration time (it redirects) and exactly at the expiration time (it returns "not found"
and does not redirect).

**Acceptance Scenarios**:

1. **Given** the creator chooses a lifetime, **When** the link is created, **Then** the service shows
   the short link along with its expiration time.
2. **Given** a link whose expiration time has not been reached, **When** a visitor opens it,
   **Then** they are redirected to the original URL.
3. **Given** a link whose expiration time has been reached or has passed, **When** a visitor opens it,
   **Then** they are not redirected, and they get the same "link not found" response (404) as for a
   code that was never issued.
4. **Given** a visitor who used a link before it expired, **When** they open it again after it expires,
   **Then** they are not redirected.
5. **Given** a lifetime that is not on the allowed list (for example, 2 hours), **When** the creator
   submits it, **Then** no link is created and the creator sees a message listing the allowed
   lifetimes.
6. **Given** the creator doesn't choose a lifetime, **When** the link is created, **Then** it expires
   24 hours after creation.
7. **Given** the creator chooses "never expires", **When** the link is created, **Then** the service
   shows that it never expires, and it keeps redirecting no matter how much time passes.

---

### Edge Cases

- **Same URL submitted twice**: creates two independent links, each with its own expiration (FR-005).
- **URL without a scheme** (`example.com`): rejected, with a hint to add `https://`. It is not
  corrected automatically (A-02).
- **URL with surrounding spaces, line breaks, tabs, backslashes or uppercase letters**
  (`  HTTPS://Example.COM  `, `https://exa<line break>mple.com`, `https:\\example.com`): read the way
  browsers read it, and stored in normalized form, which here is `https://example.com/` (FR-019).
- **URL longer than 2,048 characters once normalized**: rejected (FR-002). A URL with non-ASCII text
  can look short and still exceed the limit once it is encoded.
- **URL with a query string, fragment, percent-encoding or non-ASCII characters**: the visitor is
  redirected to its normalized form, with the query string and fragment kept (FR-019).
- **Short link whose destination is another short link from this service**: allowed. Redirect loops
  can't happen, because a link's destination never changes after it is created.
- **No lifetime chosen**: the link lives 24 hours (FR-011). "Never expires" has to be chosen
  explicitly.
- **Lifetime not on the allowed list** (2 hours, zero, a negative value, free text, empty, `null`):
  rejected, and no link is created (FR-011, FR-012).
- **Lifetime spanning a daylight-saving change**: unaffected, because lifetimes are exact durations
  (FR-012).
- **Link opened exactly at its expiration time**: it counts as expired and returns "not found"
  (FR-013).
- **Expired link versus a code that was never issued**: visitors get the same "not found" response for
  both, so nobody can tell whether a code ever existed (FR-013).
- **Short code of an expired link**: never reassigned, so an old short link that is still circulating
  can never start pointing somewhere new (FR-004).
- **Two creators submitting at the same moment**: each one gets a unique code (FR-004).
- **Saving fails while a link is being created** (for example, the disk is full): no link is shown,
  and the creator sees an error (FR-021).
- **Storage can't be written when the service starts**: the service does not start (FR-022).
- **Service restart**: every link and expiration time survives it (FR-017).
- **Service restarted on a different port or host**: short links keep using the configured base
  address (FR-020). That address must match where the service can actually be reached, and changing it
  breaks every link already shared.
- **Server clock jumps** (after sleep, or a time-sync correction): links expire early or late. This is
  an accepted risk, because the service's clock is the only reference (FR-013).
- **Creator and visitor in different time zones**: the expiration is one absolute moment, so it is the
  same for everyone (FR-014).
- **Unreachable or malicious destination**: not checked, and the service redirects anyway (A-13 and
  "What Changes at Scale").

## Requirements *(mandatory)*

### Functional Requirements

**Creating short links**

- **FR-001**: Creators MUST be able to submit an original URL and receive a short link for it.
- **FR-002**: The system MUST read each submitted URL the way web browsers do (the WHATWG URL
  Standard). It MUST accept the URL only if the result is an absolute `http` or `https` URL with a
  host, and its normalized form (FR-019) is at most 2,048 characters long. It MUST reject anything else
  with a message that states the reason, and MUST NOT create a link in that case.
- **FR-019**: The system MUST store, and later redirect to, the normalized form of the URL: the form
  browsers produce when they read it, which is plain ASCII. It MUST NOT store the raw text that was
  submitted. For example, surrounding spaces and line breaks are dropped, `HTTPS://Example.COM`
  becomes `https://example.com/`, and non-ASCII characters are converted to their ASCII-encoded form.
- **FR-003**: The system MUST generate the short code itself. Creators cannot choose it.
- **FR-004**: Each short code MUST be unique across every link ever created, expired links included,
  and MUST NOT ever be reassigned to a different URL.
- **FR-005**: Every accepted submission MUST create a new short link, even when the same original URL
  has been shortened before.
- **FR-006**: Short codes MUST be at most 8 characters long and contain only letters and digits. They
  MUST be generated randomly rather than in sequence, so that knowing one short link does not reveal
  others.
- **FR-007**: After creating a link, the system MUST show the full short link (the configured base
  address plus the code) in a form the creator can copy, together with its expiration time, or a note
  that it never expires.
- **FR-020**: Short links MUST be built from a single base address set in the service's configuration,
  never from details of the incoming request.
- **FR-021**: The system MUST show a short link to the creator only after the link has been durably
  saved. If saving fails, the creator MUST see an error, and no link is shown.

**Redirecting**

- **FR-008**: Opening an active short link MUST redirect the visitor to the link's stored URL, in its
  normalized form (FR-019).
- **FR-009**: Opening an unknown short code MUST show a "link not found" message and MUST NOT redirect.
- **FR-010**: Redirects MUST be temporary. Visitors' browsers then check with the service on every
  visit, which means an expired link stops working even for visitors who used it before.

**Expiration**

- **FR-011**: Creators MUST be able to choose a link's lifetime (how long it lives) when they create
  it, and "never expires" MUST be one of the choices. If the creator doesn't choose, the lifetime MUST
  be 24 hours. Only an omitted lifetime counts as "not chosen": "never expires" MUST be requested
  explicitly, and an empty or `null` lifetime MUST be rejected.
- **FR-012**: A link's expiration time MUST be its creation time plus its lifetime. Links that never
  expire have no expiration time. The allowed lifetimes MUST be exactly these durations: 1 hour,
  24 hours, 7 days (168 hours), 30 days (720 hours), and "never expires". They are exact durations, not
  calendar days, so daylight-saving changes don't affect them. The web page and the programmatic
  interface MUST offer the same set. Any other lifetime MUST be rejected with a message listing the
  allowed ones, and no link is created.
- **FR-013**: A link MUST count as expired from the instant the current time reaches its expiration
  time. The service's own clock is the only reference: a visit happens when the service receives it,
  and creation and expiration times are kept to the millisecond, without rounding. Opening an expired
  link MUST return exactly the same "link not found" response (HTTP 404) as an unknown short code
  (FR-009), and MUST NOT redirect.
- **FR-014**: An expiration time MUST refer to a single, unambiguous moment, the same for every
  visitor. The web page MUST show the expiration time the service calculated, in the viewer's local
  time zone. It MUST NOT work out the expiration time from the viewer's own clock.
- **FR-015**: A link's lifetime and expiration time MUST NOT change after creation. There is no way to
  extend a link, shorten it, or end it early.

**Access and availability**

- **FR-016**: Anyone MUST be able to create short links without signing in or identifying themselves.
  Following a short link MUST NOT require signing in either.
- **FR-017**: Links and their expiration times MUST survive a restart of the service.
- **FR-022**: The service MUST refuse to start if its storage can't be written. It MUST NOT fall back
  to temporary storage, which would lose links and allow codes to be reused after a restart.
- **FR-018**: Link creation MUST be available through a web page. It MUST also be available through a
  documented programmatic interface, which is the same one the web page uses.

### Key Entities

- **Short link**: one shortened URL. Attributes:
  - short code: unique and permanent
  - original URL: stored in normalized form (FR-019); never changes after creation
  - creation time: kept to the millisecond
  - lifetime: one of 1 hour, 24 hours (default), 7 days, 30 days, or never expires (FR-011, FR-012)
  - expiration time: creation time plus lifetime, or none if the link never expires; never changes
    (FR-015)

  Links have no owner, because creators are anonymous (FR-016). The service does not record visits.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time creator turns a long URL into a copyable short link from the web page in
  under 30 seconds, without instructions.
- **SC-002**: 100% of visits to active short links land on the original URL in its normalized form,
  including its query string and fragment.
- **SC-003**: 0 visits made at or after a link's expiration time are redirected. This is verified at
  one second before the expiration time (the link redirects) and exactly at it (it doesn't).
- **SC-004**: 100% of invalid submissions are rejected with a message that says what to fix, and none
  of them produces a short link.
- **SC-005**: Across 10,000 generated links, every code is at most 8 characters long and no two links
  share a code.
- **SC-006**: 100% of links created before a service restart behave the same after it (they still
  redirect if active, and still return "not found" if expired).
- **SC-007**: Following a short link adds no noticeable wait: the service answers 95% of visits in
  under 0.5 seconds when run locally.

## Assumptions

These fill gaps in the customer request. Each one is stated explicitly so it can be challenged in
`/speckit-clarify`. None of them has been confirmed by the customer. Assumptions that a clarification
has settled are removed, and their IDs are not reused.

- **A-01**: The service generates short codes. Custom aliases are not offered, because the customer
  didn't ask for them.
- **A-02**: Only `http` and `https` destinations are accepted. Input without a scheme (`example.com`) is
  rejected with a hint; it is not corrected automatically.
- **A-03**: URLs can be at most 2,048 characters long, counted on the normalized form (FR-002). All
  common browsers handle that length safely.
- **A-04**: Shortening the same URL twice creates two independent links, so each one can have its own
  expiration.
- **A-08**: Expired links are kept, so that their codes are never reused (FR-004). Cleaning up old
  links is out of scope.
- **A-09**: Short codes are at most 8 characters, using letters and digits only.
- **A-10**: Visitors never sign in to follow a link.
- **A-11**: Short links use the base address set in configuration (FR-020). The service runs locally.
  Deployment and custom domains are out of scope (constitution, Technical Constraints).
- **A-12**: The challenge brief requires a web UI, so the web page is the main way to create links. The
  programmatic interface it uses is documented for other software.
- **A-13**: The service does not check whether a destination is reachable or safe.
- **A-14**: Volume is expected to be small, at demo and evaluation scale: up to about 100,000 links and
  a handful of people using the service at the same time.
- **A-15**: The interface is in English only.
- **A-16**: The service does not track visits or provide analytics.
- **A-17**: Exactly one copy of the service runs, with one storage location. Deleting that storage
  erases the record of which codes were issued, so links already shared could later point to new
  destinations. Whoever runs the service must not delete it.

### Out of Scope

These were not requested and will not be built:

- custom aliases
- changing a link's destination
- deleting links, or changing their lifetime after creation (FR-015)
- disabling or taking down a link, by creators or by whoever runs the service (Q2)
- protecting a destination after its short link expires (Q1)
- user accounts and sign-in (FR-016)
- visit analytics
- QR codes
- link previews or warning pages
- creating links in bulk
- password-protected links
- branded or custom domains
- deployment, hosting and public exposure (Q3)

## Known Pitfalls and Decisions

A QA pass on 2026-11-20 tried to break this spec. This section records what it found and what was
decided. The IDs D1 to D9 and Q1 to Q3 match that review.

### Fixed in the requirements

| ID | Pitfall | Decision |
|----|---------|----------|
| D1 | Browsers rewrite URLs as they read them: they drop line breaks, read `https:\\example.com` as `https://example.com/`, and encode non-ASCII text. Storing the raw text would make some redirects fail outright. | URLs are read the way browsers read them, and the service stores and redirects to that normalized form (FR-002, FR-008, FR-019). |
| D2 | The 2,048-character limit had no unit: one emoji counts as 1, 2, 4 or 12 characters depending on how you count. | The limit applies to the normalized form, which is plain ASCII (FR-002). |
| D4 | Short links were built from "the address the service runs on". A restart on another port or host broke every shared link. Taking the address from incoming requests is wrong behind a proxy and can be faked. | One fixed base address, set in configuration (FR-020). |
| D5 | A crash or a full disk right after a link was shown left a shared link that was never saved. Temporary storage, or two copies of the service with separate storage, could issue old codes again. | A link is shown only once saved (FR-021). The service won't start without writable storage (FR-022). Exactly one copy runs (A-17). |
| D6 | "7 days" across a daylight-saving change could mean 167 or 169 hours. Times could be rounded. The server clock can jump. The web page could work out the expiration from the visitor's clock. | Lifetimes are exact durations. Times are kept to the millisecond without rounding. The service's clock is the only reference, and clock jumps are an accepted risk. The web page shows the expiration the service calculated (FR-012 to FR-014). |
| D7 | Through the programmatic interface, an empty or `null` lifetime could be read as 24 hours, as "never", or as an error. | Only an omitted lifetime means 24 hours. "Never" must be explicit. Empty or `null` is rejected (FR-011). |

### Not adopted (accepted risks)

| ID | Pitfall | What remains |
|----|---------|--------------|
| D3 | "At most 8 characters" allows short codes that are easy to guess. The spec doesn't say whether upper and lower case differ. A code could match one of the app's own page addresses (for example, `settings`). | FR-006 stands as written, and these risks remain. |
| D8 | A "temporary" redirect can still be cached if the response allows it. | FR-010 stands. A browser that cached a redirect may keep following it after the link expires. |
| D9 | URLs can contain a user name and password (`https://user:pass@host`), or disguise the real host (`https://paypal.com@evil.example` goes to evil.example). | Such URLs are accepted. A password in a URL is stored as plain text and visible to anyone who opens the short link. |

### Out of scope (customer, 2026-11-20)

| ID | Pitfall | Decision |
|----|---------|----------|
| Q1 | Expiration stops the short link from working, but doesn't protect the destination: people who used the link keep the URL, anyone could see it while the link was active, and chat-app previews remain. | Out of scope. Expiration only controls whether the short link works. |
| Q2 | "Never expires", anonymous creation and no deletion mean a harmful link can never be switched off, not even by whoever runs the service. | Out of scope. There is no takedown. |
| Q3 | Anonymous, unlimited, permanent and unscreened links are only safe while the service runs locally. | Out of scope. The service runs locally only (A-11). |

### Other inputs: behavior under this spec

| Input | Behavior |
|-------|----------|
| `  https://example.com  `, `HTTPS://EXAMPLE.COM` | Accepted, and normalized to `https://example.com/` (FR-019). |
| `http://192.168.1.1/admin`, `http://localhost` | Accepted, like any `http` or `https` URL with a host (FR-002). |
| `/abc12345/`, `/abc12345.` | "Not found", because neither is an issued code (FR-009). |
| `/abc12345?utm=x` | The extra query is ignored, and the visitor goes to the stored URL (FR-008). |
| A missing, `null`, number or list URL sent through the programmatic interface | Rejected with a message (FR-002). A limit on request size is left to the plan. |
| The same form submitted twice | Two separate links (FR-005). |

### Test design (not decided; for the plan)

- **SC-005 can't fail on its own.** 10,000 random codes out of about 2×10^14 never collide, so the test
  passes even without collision handling. Testing it needs a controllable code generator that can force
  a collision.
- **SC-001 and SC-007 can't be automated tests.** The plan should treat them as manual checks.

## What Changes at Scale (documented, not built)

This feature is built for demo scale (A-14), and constitution principle I keeps scale work out of it.
At real traffic, six things would change. **Caching**: popular links would be served from memory
instead of storage, with each cached entry dropped no later than the link's expiration time. **A
key-generation service** would hand out pre-generated unique codes instead of generating random ones
and retrying on a collision, and codes would get longer as the roughly 2×10^14 possible 8-character
codes fill up. **Sharding**: link storage would be split by short code across several machines, with
copies for faster reads and availability. **Rate limiting** would cap how many links each client can
create, to stop spam and scripts that fill up storage. **Abuse and phishing** handling would screen
destinations against lists of known threats, and add a way to report and disable harmful links.
**Analytics** would count visits in the background, so redirects stay fast.
