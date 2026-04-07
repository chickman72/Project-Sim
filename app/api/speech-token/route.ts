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
    const tokenResp = await fetch(
      `https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': speechKey,
        },
      },
    )

    if (!tokenResp.ok) {
      const detail = await tokenResp.text()
      return NextResponse.json(
        { error: 'Failed to issue speech token', details: detail || `Status ${tokenResp.status}` },
        { status: 502 },
      )
    }

    const authToken = await tokenResp.text()
    return NextResponse.json({ token: authToken, region: speechRegion })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unexpected error issuing speech token' },
      { status: 500 },
    )
  }
}
