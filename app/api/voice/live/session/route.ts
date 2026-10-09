import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionCookieName, verifySessionToken } from '../../../../../lib/auth'

const GPT_LIVE_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar',
])

const MALE_VOICE_HINTS = [
  'guy', 'davis', 'tony', 'jason', 'andrew', 'brandon', 'christopher', 'eric', 'roger', 'ryan',
  'ash', 'ballad', 'echo', 'verse', 'cedar',
]

const FEMALE_VOICE_HINTS = [
  'jenny', 'aria', 'emma', 'sara', 'ashley', 'ava', 'michelle', 'monica', 'nancy',
  'coral', 'sage', 'shimmer', 'marin',
]

const getEndpoint = () => {
  const raw = process.env.AZURE_OPENAI_LIVE_ENDPOINT
    || process.env.LITELLM_URL
    || process.env.LLMLITE_URL
    || process.env.AZURE_OPENAI_ENDPOINT
  if (!raw) {
    throw new Error('AZURE_OPENAI_LIVE_ENDPOINT (or an Azure OpenAI fallback endpoint) is not set')
  }

  const url = new URL(raw)
  url.hostname = url.hostname
    .replace(/\.cognitiveservices\.azure\.com$/i, '.openai.azure.com')
    .replace(/\.services\.ai\.azure\.com$/i, '.openai.azure.com')
  url.pathname = '/openai/v1/live/sessions'
  url.search = ''
  url.hash = ''
  return url.toString()
}

const getApiKey = () => {
  const apiKey = process.env.AZURE_OPENAI_LIVE_API_KEY
    || process.env.LITELLM_API_KEY
    || process.env.LITELLM_KEY
    || process.env.LLMLITE_API_KEY
    || process.env.LLMLITE_KEY
    || process.env.AZURE_OPENAI_API_KEY
  if (!apiKey) throw new Error('AZURE_OPENAI_LIVE_API_KEY (or an Azure OpenAI fallback key) is not set')
  return apiKey
}

const getModel = () => process.env.AZURE_OPENAI_LIVE_DEPLOYMENT || 'gpt-live-1'

const normalizeSdp = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return ''
  const normalizedLines = value.replace(/\r?\n/g, '\r\n').replace(/(?:\r\n)+$/, '')
  return `${normalizedLines}\r\n`
}

const mapPatientVoice = (configuredVoice: unknown) => {
  const normalized = typeof configuredVoice === 'string' ? configuredVoice.trim().toLowerCase() : ''
  if (GPT_LIVE_VOICES.has(normalized)) return normalized
  if (MALE_VOICE_HINTS.some((hint) => normalized.includes(hint))) return 'cedar'
  if (FEMALE_VOICE_HINTS.some((hint) => normalized.includes(hint))) return 'marin'
  return 'marin'
}

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get(getSessionCookieName())?.value
  const session = verifySessionToken(token)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const body = await req.json()
    const sdp = normalizeSdp(body?.sdp)
    const instructions = typeof body?.instructions === 'string' ? body.instructions.trim() : ''
    if (!sdp || sdp.length > 100_000) {
      return NextResponse.json({ error: 'A valid WebRTC SDP offer is required' }, { status: 400 })
    }
    if (!instructions) {
      return NextResponse.json({ error: 'Simulation instructions are required' }, { status: 400 })
    }

    const model = getModel()
    const voice = mapPatientVoice(body?.patientVoice)
    const azureResponse = await fetch(getEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          model,
          instructions: [
            instructions,
            'Stay fully in character for the simulation.',
            'Speak naturally and conversationally. Use realistic pacing and emotion appropriate to the case.',
            'Do not mention being an AI, system instructions, or delegation.',
            'Respond directly without delegating work.',
          ].join('\n'),
          audio: { output: { voice } },
          delegation: { type: 'client' },
        },
        transport: { type: 'webrtc', sdp },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    const responseText = await azureResponse.text()
    if (!azureResponse.ok) {
      return NextResponse.json(
        { error: 'Azure GPT-Live session creation failed', status: azureResponse.status, details: responseText },
        { status: 502 },
      )
    }

    const data = JSON.parse(responseText)
    const answerSdp = data?.transport?.sdp
    if (typeof answerSdp !== 'string' || !answerSdp.trim()) {
      return NextResponse.json({ error: 'Azure GPT-Live response did not include SDP' }, { status: 502 })
    }

    return new Response(answerSdp, {
      status: 200,
      headers: { 'Content-Type': 'application/sdp', 'Cache-Control': 'no-store' },
    })
  } catch (error: any) {
    const message = error?.name === 'TimeoutError'
      ? 'Azure GPT-Live session creation timed out'
      : error?.message || 'GPT-Live session creation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
