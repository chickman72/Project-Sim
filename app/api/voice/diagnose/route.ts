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

    const bases = Array.from(new Set([baseOpenAi, baseRaw]))
    const apiVersions = getApiVersions()
    const sessionPaths = [
      (apiVersion: string) =>
        `openai/realtime/sessions?api-version=${encodeURIComponent(apiVersion)}`,
      (apiVersion: string) =>
        `openai/deployments/${encodeURIComponent(
          deployment,
        )}/realtime/sessions?api-version=${encodeURIComponent(apiVersion)}`,
    ]
    const results = []

    for (const base of bases) {
      for (const apiVersion of apiVersions) {
        for (const buildPath of sessionPaths) {
          const url = `${base}/${buildPath(apiVersion)}`
          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': apiKey,
            },
            body: JSON.stringify({ model: deployment }),
          })
          const bodyText = await resp.text()
          results.push({
            url,
            status: resp.status,
            ok: resp.ok,
            body: bodyText,
          })
        }
      }
    }

    return NextResponse.json({ results })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Diagnose failed' }, { status: 500 })
  }
}
