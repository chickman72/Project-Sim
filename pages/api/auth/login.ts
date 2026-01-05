import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateLogin, createSessionToken, getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { toAuditJson, writeAuditRecord } from '../../../lib/audit-log'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { userId, password } = req.body || {}
  if (typeof userId !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'userId and password required' })
  }

  try {
    const ok = authenticateLogin(userId, password)
    if (!ok) {
      try {
        await writeAuditRecord({
          eventType: 'login',
          ok: false,
          userId: userId.trim() || null,
          sessionId: null,
          clientIp: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
          userAgent: String(req.headers['user-agent'] || ''),
          path: req.url || null,
          method: req.method || null,
          errorJson: toAuditJson({ message: 'Invalid credentials' }),
        })
      } catch (logErr) {
        console.error('Failed writing audit log', logErr)
      }

      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = createSessionToken(userId)
    const session = verifySessionToken(token)
    const secure = process.env.NODE_ENV === 'production'
    const cookie = `${getSessionCookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}${secure ? '; Secure' : ''}`
    res.setHeader('Set-Cookie', cookie)

    try {
      await writeAuditRecord({
        eventType: 'login',
        ok: true,
        userId: userId.trim() || null,
        sessionId: session?.sessionId ?? null,
        clientIp: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
        userAgent: String(req.headers['user-agent'] || ''),
        path: req.url || null,
        method: req.method || null,
      })
    } catch (logErr) {
      console.error('Failed writing audit log', logErr)
    }

    return res.status(200).json({ userId })
  } catch (err: any) {
    try {
      await writeAuditRecord({
        eventType: 'login',
        ok: false,
        userId: userId.trim() || null,
        sessionId: null,
        clientIp: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
        userAgent: String(req.headers['user-agent'] || ''),
        path: req.url || null,
        method: req.method || null,
        errorJson: toAuditJson({ message: err?.message ?? String(err), name: err?.name, stack: err?.stack }),
      })
    } catch (logErr) {
      console.error('Failed writing audit log', logErr)
    }
    return res.status(500).json({ error: err?.message ?? 'Login failed' })
  }
}
