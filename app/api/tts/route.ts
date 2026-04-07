import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionCookieName, verifySessionToken } from '../../../lib/auth'

const DEFAULT_PATIENT_VOICE = 'en-US-JennyNeural'

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
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
      { error: 'Azure Speech configuration missing (AZURE_SPEECH_KEY/AZURE_SPEECH_REGION)' },
      { status: 500 },
    )
  }

  let body: any = null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const voice = typeof body?.voice === 'string' && body.voice.trim() ? body.voice.trim() : DEFAULT_PATIENT_VOICE

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const url = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`
  const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${escapeXml(voice)}">${escapeXml(
    text,
  )}</voice></speak>`

  const azureResp = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
      'User-Agent': 'CognitiveClinicals',
    },
    body: ssml,
  })

  if (!azureResp.ok) {
    const detail = await azureResp.text()
    return NextResponse.json(
      { error: 'Azure TTS request failed', details: detail || `Status ${azureResp.status}` },
      { status: 502 },
    )
  }

  const audioBuffer = await azureResp.arrayBuffer()
  return new Response(audioBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  })
}
