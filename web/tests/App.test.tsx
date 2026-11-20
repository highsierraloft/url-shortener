import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../src/App'

const SHORT_URL = 'http://short.test/abc1234A'
const SERVER_EXPIRES_AT = '2030-06-15T10:30:00.000Z'
const MISSING_SCHEME_MESSAGE = 'Add https:// to the start, for example https://example.com.'
const STORAGE_MESSAGE = "The link couldn't be saved. Try again."
const NETWORK_MESSAGE = "Couldn't reach the service. Try again."

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function created(expiresAt: string | null) {
  return json({ code: 'abc1234A', shortUrl: SHORT_URL, expiresAt }, 201)
}

function apiError(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function stubFetch(...responses: Array<Response | Promise<Response> | Error>) {
  const queue = [...responses]
  const fetchStub = vi.fn(async () => {
    const next = queue.shift()
    if (next instanceof Error) throw next
    if (next === undefined) throw new Error('unexpected extra fetch call')
    return next
  })
  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

function expectedExpiry(expiresAt: string): string {
  return `Expires on ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(expiresAt))}`
}

async function shorten(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByRole('textbox', { name: 'Long URL' }), text)
  await user.click(screen.getByRole('button', { name: 'Shorten' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('App form', () => {
  it('shows the Long URL input, the Expires after select and the Shorten button', () => {
    render(<App />)

    expect(screen.getByRole('textbox', { name: 'Long URL' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Expires after' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Shorten' })).toBeTruthy()
  })

  it('offers the five lifetimes with their values, in order', () => {
    render(<App />)

    const options = screen
      .getAllByRole('option')
      .map((o) => [o.textContent, (o as HTMLOptionElement).value])

    expect(options).toEqual([
      ['1 hour', '1h'],
      ['24 hours', '24h'],
      ['7 days', '7d'],
      ['30 days', '30d'],
      ['Never', 'never'],
    ])
  })

  it('selects 24 hours by default', () => {
    render(<App />)

    const select = screen.getByRole('combobox', { name: 'Expires after' }) as HTMLSelectElement
    expect(select.value).toBe('24h')
  })

  it('shows no result, error or Copy button before anything is submitted', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Shorten' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('App submitting', () => {
  it('sends exactly one POST /api/links with the URL as typed and the default lifetime', async () => {
    const fetchStub = stubFetch(created(SERVER_EXPIRES_AT))
    const user = userEvent.setup()
    render(<App />)

    await shorten(user, '  https://example.com/a long path  ')
    await screen.findByRole('link', { name: SHORT_URL })

    expect(fetchStub).toHaveBeenCalledTimes(1)
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/links')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({
      url: '  https://example.com/a long path  ',
      lifetime: '24h',
    })
  })

  it.each([
    ['7 days', '7d', SERVER_EXPIRES_AT],
    ['Never', 'never', null],
  ])('sends lifetime %s as %s when chosen', async (label, value, expiresAt) => {
    const fetchStub = stubFetch(created(expiresAt))
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Expires after' }), label)
    await shorten(user, 'https://example.com')
    await screen.findByRole('link', { name: SHORT_URL })

    const [, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      url: 'https://example.com',
      lifetime: value,
    })
  })

  it('disables the button and reads "Shortening…" while the request is in flight', async () => {
    const pending = deferred<Response>()
    stubFetch(pending.promise)
    const user = userEvent.setup()
    render(<App />)

    await shorten(user, 'https://example.com')

    const busy = (await screen.findByRole('button', { name: 'Shortening…' })) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Shorten' })).toBeNull()

    pending.resolve(created(SERVER_EXPIRES_AT))

    const idle = (await screen.findByRole('button', { name: 'Shorten' })) as HTMLButtonElement
    expect(idle.disabled).toBe(false)
  })
})

describe('App success', () => {
  it('shows the short URL as a link to itself', async () => {
    stubFetch(created(SERVER_EXPIRES_AT))
    const user = userEvent.setup()
    render(<App />)

    await shorten(user, 'https://example.com')

    const link = await screen.findByRole('link', { name: SHORT_URL })
    expect(link.getAttribute('href')).toBe(SHORT_URL)
  })

  it('copies the short URL to the clipboard, then the button reads "Copied"', async () => {
    stubFetch(created(SERVER_EXPIRES_AT))
    const user = userEvent.setup()
    render(<App />)
    await shorten(user, 'https://example.com')

    await user.click(await screen.findByRole('button', { name: 'Copy' }))

    expect(await navigator.clipboard.readText()).toBe(SHORT_URL)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('shows the expiry in the pinned format for the server expiresAt', async () => {
    stubFetch(created(SERVER_EXPIRES_AT))
    const user = userEvent.setup()
    render(<App />)

    await shorten(user, 'https://example.com')

    expect(await screen.findByText(expectedExpiry(SERVER_EXPIRES_AT))).toBeTruthy()
    expect(screen.queryByText('Never expires')).toBeNull()
  })

  it('shows "Never expires" when expiresAt is null', async () => {
    stubFetch(created(null))
    const user = userEvent.setup()
    render(<App />)

    await shorten(user, 'https://example.com')

    expect(await screen.findByText('Never expires')).toBeTruthy()
    expect(screen.queryByText(/^Expires on /)).toBeNull()
  })

  it('shows the server expiresAt, not one computed from the client clock (FR-014)', async () => {
    stubFetch(created(SERVER_EXPIRES_AT))
    const user = userEvent.setup()
    vi.setSystemTime(new Date('2001-01-01T00:00:00.000Z'))
    render(<App />)

    await shorten(user, 'https://example.com')
    const expected = expectedExpiry(SERVER_EXPIRES_AT)
    expect((await screen.findByText(expected)).textContent).toBe(expected)

    vi.setSystemTime(new Date('2045-12-31T23:59:00.000Z'))
    await user.click(await screen.findByRole('button', { name: 'Copy' }))

    expect(screen.getByText(expected).textContent).toBe(expected)
  })
})

describe('App errors', () => {
  it('shows the server message in an alert and no result on a 400', async () => {
    stubFetch(apiError(400, 'MISSING_SCHEME', MISSING_SCHEME_MESSAGE))
    const user = userEvent.setup()
    render(<App />)

    await shorten(user, 'example.com')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(MISSING_SCHEME_MESSAGE)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.queryByText(/^Expires on /)).toBeNull()
    expect(screen.queryByText('Never expires')).toBeNull()
  })

  it('shows the server message in an alert and no result on a 500 STORAGE_ERROR', async () => {
    stubFetch(apiError(500, 'STORAGE_ERROR', STORAGE_MESSAGE))
    const user = userEvent.setup()
    render(<App />)

    await shorten(user, 'https://example.com')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(STORAGE_MESSAGE)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })

  it('shows the server message in an alert and no result on a 413 PAYLOAD_TOO_LARGE', async () => {
    const message = 'The request is too large.'
    stubFetch(apiError(413, 'PAYLOAD_TOO_LARGE', message))
    const user = userEvent.setup()
    render(<App />)

    await shorten(user, 'https://example.com')

    expect((await screen.findByRole('alert')).textContent).toBe(message)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })

  it('re-enables the Shorten button after an error', async () => {
    stubFetch(apiError(400, 'MISSING_SCHEME', MISSING_SCHEME_MESSAGE))
    const user = userEvent.setup()
    render(<App />)

    await shorten(user, 'example.com')
    await screen.findByRole('alert')

    const button = screen.getByRole('button', { name: 'Shorten' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('shows the fallback message when fetch rejects', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<App />)

    await shorten(user, 'https://example.com')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(NETWORK_MESSAGE)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('clears an earlier error when a later submit succeeds', async () => {
    stubFetch(
      apiError(400, 'MISSING_SCHEME', MISSING_SCHEME_MESSAGE),
      created(SERVER_EXPIRES_AT),
    )
    const user = userEvent.setup()
    render(<App />)
    await shorten(user, 'example.com')
    await screen.findByRole('alert')

    await user.clear(screen.getByRole('textbox', { name: 'Long URL' }))
    await shorten(user, 'https://example.com')

    expect(await screen.findByRole('link', { name: SHORT_URL })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
