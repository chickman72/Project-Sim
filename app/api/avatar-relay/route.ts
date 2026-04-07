import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(getSessionCookieName())?.value
  const session = verifySessionToken(token)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const speechKey = process.env.AZURE_SPEECH_KEY
  const speechRegion = process.env.AZURE_SPEECH_REGION
  if (!speechKey || !speechRegion) {
    return NextResponse.json(
      { error: 'AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be configured' },
      { status: 500 },
    )
  }

  try {
    const relayResp = await fetch(
      `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1`,
      {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': speechKey,
        },
      },
    )

    const text = await relayResp.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { raw: text }
    }

    if (!relayResp.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch avatar relay token', details: data },
        { status: 502 },
      )
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unexpected error fetching avatar relay token' },
      { status: 500 },
    )
  }
}
