export type Lifetime = '1h' | '24h' | '7d' | '30d' | 'never'
export interface CreatedLink {
  code: string
  shortUrl: string
  expiresAt: string | null
}
export type CreateLinkResult = { ok: true; link: CreatedLink } | { ok: false; message: string }

const NETWORK_ERROR_MESSAGE = "Couldn't reach the service. Try again."

export async function createLink(url: string, lifetime: Lifetime): Promise<CreateLinkResult> {
  let response: Response

  try {
    response = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, lifetime }),
    })
  } catch {
    return { ok: false, message: NETWORK_ERROR_MESSAGE }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, message: NETWORK_ERROR_MESSAGE }
  }

  if (!response.ok) {
    if (isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string' && body.error.message.length > 0) {
      return { ok: false, message: body.error.message }
    }

    return { ok: false, message: NETWORK_ERROR_MESSAGE }
  }

  if (isCreatedLink(body)) {
    return { ok: true, link: body }
  }

  return { ok: false, message: NETWORK_ERROR_MESSAGE }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCreatedLink(value: unknown): value is CreatedLink {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.shortUrl === 'string' &&
    (typeof value.expiresAt === 'string' || value.expiresAt === null)
  )
}
