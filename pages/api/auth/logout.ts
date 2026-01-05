import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'
import { writeAuditRecord } from '../../../lib/audit-log'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const token = req.cookies?.[getSessionCookieName()]
  const session = verifySessionToken(token)
  const secure = process.env.NODE_ENV === 'production'
  const cookie = `${getSessionCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
  res.setHeader('Set-Cookie', cookie)

  try {
    await writeAuditRecord({
      eventType: 'logout',
      ok: true,
      userId: session?.userId || null,
      sessionId: session?.sessionId || null,
      clientIp: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
      userAgent: String(req.headers['user-agent'] || ''),
      path: req.url || null,
      method: req.method || null,
    })
  } catch (logErr) {
    console.error('Failed writing audit log', logErr)
  }

  return res.status(200).json({ ok: true })
}
