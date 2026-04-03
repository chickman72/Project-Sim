import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionCookieName, verifySessionToken } from '../../../../lib/auth'

const getBaseEndpoint = () => {
  const raw = process.env.AZURE_OPENAI_ENDPOINT
  if (!raw) throw new Error('AZURE_OPENAI_ENDPOINT is not set')
  return raw.trim().replace(/\/+$/, '')
}

const toOpenAiEndpoint = (base: string) => {
  return base.replace(/\.cognitiveservices\.azure\.com$/, '.openai.azure.com')
}

const getRealtimeDeployment = () => {
  const deployment = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT
  if (!deployment) throw new Error('AZURE_OPENAI_REALTIME_DEPLOYMENT is not set')
  return deployment
}

const getApiKey = () => {
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  if (!apiKey) throw new Error('AZURE_OPENAI_API_KEY is not set')
  return apiKey
}

const getApiVersions = () => {
  const envVersion = process.env.AZURE_OPENAI_REALTIME_API_VERSION
  if (envVersion && envVersion.trim()) {
    return [envVersion.trim()]
  }
  return ['2024-10-01-preview', '2024-12-01-preview']
}

export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(getSessionCookieName())?.value
  const session = verifySessionToken(token)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const baseRaw = getBaseEndpoint()
    const baseOpenAi = toOpenAiEndpoint(baseRaw)
    const deployment = getRealtimeDeployment()
    const apiKey = getApiKey()

    const baseCandidates = Array.from(new Set([baseOpenAi, baseRaw]))
    const apiVersions = getApiVersions()
    const sessionPaths = [
      (apiVersion: string) =>
        `openai/realtime/sessions?api-version=${encodeURIComponent(apiVersion)}`,
      (apiVersion: string) =>
        `openai/deployments/${encodeURIComponent(
          deployment,
        )}/realtime/sessions?api-version=${encodeURIComponent(apiVersion)}`,
    ]
    let data: any = null
    let baseUsed = baseOpenAi
    let lastError: { status: number; body: string; url: string } | null = null

    for (const base of baseCandidates) {
      for (const apiVersion of apiVersions) {
        for (const buildPath of sessionPaths) {
          const sessionUrl = `${base}/${buildPath(apiVersion)}`
          const resp = await fetch(sessionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': apiKey,
            },
            body: JSON.stringify({
              model: deployment,
            }),
          })

          if (resp.ok) {
            data = await resp.json()
            baseUsed = base
            lastError = null
            break
          }

          lastError = { status: resp.status, body: await resp.text(), url: sessionUrl }
        }
        if (data) break
      }
      if (data) break
    }

    if (!data) {
      return NextResponse.json(
        {
          error: 'Failed to create realtime session',
          details: lastError?.body || 'Unknown error',
          status: lastError?.status,
          url: lastError?.url,
        },
        { status: 502 },
      )
    }

    const clientSecret = data?.client_secret?.value
    const expiresAt = data?.client_secret?.expires_at
    if (!clientSecret) {
      return NextResponse.json({ error: 'Missing client secret from Azure' }, { status: 502 })
    }

    const wsApiVersion = getApiVersions()[0]
    const wsUrl = `${baseUsed.replace(
      /^https:/,
      'wss:',
    )}/openai/realtime?api-version=${encodeURIComponent(
      wsApiVersion,
    )}&deployment=${encodeURIComponent(deployment)}`

    return NextResponse.json({ clientSecret, expiresAt, wsUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Token relay failed' }, { status: 500 })
  }
}
