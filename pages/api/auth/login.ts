import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateLogin, createSessionToken, getSessionCookieName, verifySessionToken } from 'lib/auth'
import { toAuditJson, writeAuditRecord } from 'lib/audit-log'
import { listUsers, createUser, updateUser } from 'lib/user'
import { getCohortsByStudent } from 'lib/cohort'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { userId, password } = req.body || {}
  if (typeof userId !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'userId and password required' })
  }

  try {
    let user = await authenticateLogin(userId, password)
    if (!user) {
      // Check if no users exist, allow bootstrap with AUTH_PASSWORD
      const users = await listUsers()
      if (users.length === 0) {
        const expected = process.env.AUTH_PASSWORD
        if (expected && password === expected) {
          // Create default admin
          user = await createUser('admin', password, 'Administrator')
        }
      }
      if (!user) {
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
    }

    // Only allow AUTH_PASSWORD elevation for the dedicated bootstrap admin account.
    const expected = process.env.AUTH_PASSWORD
    if (
      expected &&
      password === expected &&
      user.role !== 'Administrator' &&
      user.username === 'admin'
    ) {
      await updateUser(user.id, { role: 'Administrator' })
      user.role = 'Administrator'
    }

    // Auto-correct accounts that were accidentally promoted but are clearly student accounts.
    if (user.role === 'Administrator' && user.username !== 'admin') {
      const enrolledCohorts = await getCohortsByStudent(user.id)
      if (enrolledCohorts.length > 0) {
        await updateUser(user.id, { role: 'Student' })
        user.role = 'Student'
      }
    }

    const token = createSessionToken(user.id, user.role)
    const session = verifySessionToken(token)
    const secure = process.env.NODE_ENV === 'production'
    const cookie = `${getSessionCookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}${secure ? '; Secure' : ''}`
    res.setHeader('Set-Cookie', cookie)

    try {
      await writeAuditRecord({
        eventType: 'login',
        ok: true,
        userId: user.id,
        sessionId: session?.sessionId ?? null,
        clientIp: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
        userAgent: String(req.headers['user-agent'] || ''),
        path: req.url || null,
        method: req.method || null,
      })
    } catch (logErr) {
      console.error('Failed writing audit log', logErr)
    }

    return res.status(200).json({ userId: user.id, username: user.username, role: user.role, requiresPasswordChange: user.requiresPasswordChange ?? false })
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
