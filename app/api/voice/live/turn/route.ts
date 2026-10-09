import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionCookieName, verifySessionToken } from '../../../../../lib/auth'
import { toAuditJson, writeAuditRecord } from '../../../../../lib/audit-log'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get(getSessionCookieName())?.value
  const session = verifySessionToken(token)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const body = await req.json()
    const studentInput = typeof body?.studentInput === 'string' ? body.studentInput.trim() : ''
    const aiOutput = typeof body?.aiOutput === 'string' ? body.aiOutput.trim() : ''
    const scenarioId = typeof body?.scenarioId === 'string' ? body.scenarioId.trim() : undefined
    if (!studentInput || !aiOutput) {
      return NextResponse.json({ error: 'studentInput and aiOutput are required' }, { status: 400 })
    }

    await writeAuditRecord({
      eventType: 'chat',
      ok: true,
      userId: session.userId,
      sessionId: session.sessionId,
      clientIp: String(req.headers.get('x-forwarded-for') || ''),
      userAgent: String(req.headers.get('user-agent') || ''),
      path: new URL(req.url).pathname,
      method: req.method,
      model: process.env.AZURE_OPENAI_LIVE_DEPLOYMENT || 'gpt-live-1',
      studentInput,
      studentInputMethod: 'voice',
      aiOutput,
      scenarioId,
      completionStatus: 'in-progress',
      messagesJson: toAuditJson([
        { role: 'user', content: studentInput },
        { role: 'assistant', content: aiOutput },
      ]),
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to save voice turn' }, { status: 500 })
  }
}
