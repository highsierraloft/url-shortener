import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../src/App'

// Bug B21 (FR-014): every test in this file runs in a time zone 14 hours ahead of UTC. vi.hoisted
// sets it before App is imported, so "the viewer's local time" and UTC give different text.
const previousTimeZone = vi.hoisted(() => {
  const previous = process.env.TZ
  process.env.TZ = 'Pacific/Kiritimati'
  return previous
})

afterAll(() => {
  if (previousTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = previousTimeZone
})

afterEach(() => {
  vi.unstubAllGlobals()
})

interface Link {
  code: string
  shortUrl: string
  expiresAt: string | null
}

const FIRST: Link = { code: 'abc1234A', shortUrl: 'http://short.test/abc1234A', expiresAt: '2030-06-15T10:30:00.000Z' }
const SECOND: Link = { code: 'xyz9876B', shortUrl: 'http://short.test/xyz9876B', expiresAt: null }
const MISSING_SCHEME_MESSAGE = 'Add https:// to the start, for example https://example.com.'
const STORAGE_MESSAGE = "The link couldn't be saved. Try again."
const NETWORK_MESSAGE = "Couldn't reach the service. Try again."

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function created(link: Link): Response {
  return json(link, 201)
}

function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status)
}

function stubFetch(...responses: Array<Response | Error>) {
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

function expiryText(expiresAt: string, timeZone?: string): string {
  const format = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone })
  return `Expires on ${format.format(new Date(expiresAt))}`
}

async function shorten(user: ReturnType<typeof userEvent.setup>, text: string) {
  const input = screen.getByRole('textbox', { name: 'Long URL' })
  await user.clear(input)
  await user.type(input, text)
  await user.click(screen.getByRole('button', { name: 'Shorten' }))
}

it.each([
  [400, 'MISSING_SCHEME', MISSING_SCHEME_MESSAGE],
  [500, 'STORAGE_ERROR', STORAGE_MESSAGE],
])('Bug B17: after a later %i error, the earlier result is no longer shown', async (status, code, message) => {
  stubFetch(created(FIRST), apiError(status, code, message))
  const user = userEvent.setup()
  render(<App />)
  await shorten(user, 'https://example.com/first')
  await screen.findByRole('link', { name: FIRST.shortUrl })

  await shorten(user, 'example.com')

  expect((await screen.findByRole('alert')).textContent).toBe(message)
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull()
  expect(screen.queryByText(/^Expires on /)).toBeNull()
})

it('Bug B17: a new link\'s Copy button reads "Copy" until clicked, then copies the new link', async () => {
  stubFetch(created(FIRST), created(SECOND))
  const user = userEvent.setup()
  render(<App />)
  await shorten(user, 'https://example.com/first')
  await user.click(await screen.findByRole('button', { name: 'Copy' }))
  await screen.findByRole('button', { name: 'Copied' })

  await shorten(user, 'https://example.com/second')
  await screen.findByRole('link', { name: SECOND.shortUrl })

  expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Copy' }))
  expect(await navigator.clipboard.readText()).toBe(SECOND.shortUrl)
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
})

it('Bug B18: a 502 with an empty text/plain body (the Vite proxy with the API down) shows the network message', async () => {
  stubFetch(new Response('', { status: 502, headers: { 'content-type': 'text/plain' } }))
  const user = userEvent.setup()
  render(<App />)

  await shorten(user, 'https://example.com')

  expect((await screen.findByRole('alert')).textContent).toBe(NETWORK_MESSAGE)
  expect(screen.queryByRole('link')).toBeNull()
  const button = screen.getByRole('button', { name: 'Shorten' }) as HTMLButtonElement
  expect(button.disabled).toBe(false)
})

it('Bug B19: after fetch rejects, Shorten is enabled again and a retry succeeds', async () => {
  stubFetch(new TypeError('Failed to fetch'), created(FIRST))
  const user = userEvent.setup()
  render(<App />)

  await shorten(user, 'https://example.com')
  expect((await screen.findByRole('alert')).textContent).toBe(NETWORK_MESSAGE)

  const button = screen.getByRole('button', { name: 'Shorten' }) as HTMLButtonElement
  expect(button.disabled).toBe(false)
  await user.click(button)
  expect(await screen.findByRole('link', { name: FIRST.shortUrl })).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('Bug B20: pressing Enter in the Long URL field submits the form', async () => {
  const fetchStub = stubFetch(created(FIRST))
  const user = userEvent.setup()
  render(<App />)

  await user.type(screen.getByRole('textbox', { name: 'Long URL' }), 'https://example.com{Enter}')

  expect(await screen.findByRole('link', { name: FIRST.shortUrl })).toBeTruthy()
  expect(fetchStub).toHaveBeenCalledTimes(1)
})

it("Bug B21: the expiry is shown in the viewer's own time zone, not in UTC (FR-014)", async () => {
  const expiresAt = FIRST.expiresAt!
  const local = expiryText(expiresAt)
  const utc = expiryText(expiresAt, 'UTC')
  expect(local).not.toBe(utc)

  stubFetch(created(FIRST))
  const user = userEvent.setup()
  render(<App />)
  await shorten(user, 'https://example.com')

  expect(await screen.findByText(local)).toBeTruthy()
  expect(screen.queryByText(utc)).toBeNull()
})
