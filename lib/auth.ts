import crypto from 'node:crypto'

const COOKIE_NAME = 'psim_session'

const base64UrlEncode = (input: Buffer | string) => {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

const base64UrlDecodeToString = (input: string) => {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (padded.length % 4)) % 4
  const withPad = padded + '='.repeat(padLen)
  return Buffer.from(withPad, 'base64').toString('utf8')
}

const getSessionSecret = () => {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return secret
}

export const getSessionCookieName = () => COOKIE_NAME

export type SessionPayload = {
  sessionId: string
  userId: string
  iat: number
  exp: number
}

export const createSessionToken = (userId: string, ttlSeconds = 60 * 60 * 12) => {
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = { sessionId: crypto.randomUUID(), userId, iat: now, exp: now + ttlSeconds }
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))

  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest()
  const sigB64 = base64UrlEncode(sig)
  return `${payloadB64}.${sigB64}`
}

export const verifySessionToken = (token: string | undefined | null): SessionPayload | null => {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sigB64] = parts

  try {
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(payloadB64)
      .digest()
    const expectedB64 = base64UrlEncode(expectedSig)

    const a = Buffer.from(sigB64, 'utf8')
    const b = Buffer.from(expectedB64, 'utf8')
    if (a.length !== b.length) return null
    if (!crypto.timingSafeEqual(a, b)) return null

    const payloadStr = base64UrlDecodeToString(payloadB64)
    const payload = JSON.parse(payloadStr) as SessionPayload
    if (!payload?.userId || typeof payload.userId !== 'string') return null
    if (!payload?.sessionId || typeof payload.sessionId !== 'string') return null

    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp !== 'number' || payload.exp < now) return null
    return payload
  } catch {
    return null
  }
}

export const authenticateLogin = (userId: string, password: string) => {
  const expected = process.env.AUTH_PASSWORD
  if (!expected) throw new Error('AUTH_PASSWORD is not set')

  const normalize = (v: string) => v.normalize('NFKC')
  const ok = normalize(password) === normalize(expected)
  if (!ok) return false

  const cleaned = userId.trim()
  if (!cleaned) return false
  if (cleaned.length > 128) return false
  return true
}

