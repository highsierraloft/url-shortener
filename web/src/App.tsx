import { useState, type FormEvent, type JSX } from 'react'
import { createLink, type CreatedLink, type Lifetime } from './api'

const LIFETIME_OPTIONS: Array<{ label: string; value: Lifetime }> = [
  { label: '1 hour', value: '1h' },
  { label: '24 hours', value: '24h' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: 'Never', value: 'never' },
]

export function App(): JSX.Element {
  const [url, setUrl] = useState('')
  const [lifetime, setLifetime] = useState<Lifetime>('24h')
  const [link, setLink] = useState<CreatedLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setLink(null)
    setCopied(false)

    try {
      const result = await createLink(url, lifetime)
      if (result.ok) {
        setLink(result.link)
      } else {
        setError(result.message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCopy() {
    if (!link) return

    try {
      await navigator.clipboard.writeText(link.shortUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main>
      <h1>URL Shortener</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="long-url">Long URL</label>
          <input
            id="long-url"
            type="text"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="expires-after">Expires after</label>
          <select
            id="expires-after"
            value={lifetime}
            onChange={(event) => setLifetime(event.target.value as Lifetime)}
          >
            {LIFETIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Shortening…' : 'Shorten'}
        </button>
      </form>

      {error && <p role="alert">{error}</p>}

      {link && (
        <section>
          <a href={link.shortUrl}>{link.shortUrl}</a>
          <button type="button" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <p>
            {link.expiresAt === null
              ? 'Never expires'
              : `Expires on ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(link.expiresAt))}`}
          </p>
        </section>
      )}
    </main>
  )
}
