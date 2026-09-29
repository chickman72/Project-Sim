const DEFAULT_LITELLM_URL =
  'https://proxy-ai-anes-uabmc-awefchfueccrddhf.eastus2-01.azurewebsites.net/'

export type LlmProvider = 'azure' | 'litellm'

const getConfiguredUrl = () =>
  process.env.LITELLM_URL ||
  process.env.LLMLITE_URL ||
  process.env.AZURE_OPENAI_ENDPOINT ||
  DEFAULT_LITELLM_URL

const isAzureHost = (hostname: string) =>
  hostname.endsWith('.openai.azure.com') ||
  hostname.endsWith('.services.ai.azure.com') ||
  hostname.endsWith('.cognitiveservices.azure.com')

export const getLlmProvider = (): LlmProvider => {
  try {
    return isAzureHost(new URL(getConfiguredUrl()).hostname.toLowerCase()) ? 'azure' : 'litellm'
  } catch {
    return 'litellm'
  }
}

export const getLlmEndpoint = () => {
  const raw = getConfiguredUrl().trim()
  const url = new URL(raw)

  if (/\/chat\/completions\/?$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  }

  if (isAzureHost(url.hostname.toLowerCase())) {
    // Foundry project endpoints are intended for project/agent APIs. Stateless
    // chat completions use the resource-level OpenAI-compatible v1 route.
    url.pathname = '/openai/v1/chat/completions'
    url.search = ''
    url.hash = ''
    return url.toString()
  }

  url.pathname = `${url.pathname.replace(/\/+$/, '')}/chat/completions`
  return url.toString()
}

export const getLlmApiKey = () => {
  if (getLlmProvider() === 'azure') {
    return (
      process.env.LITELLM_API_KEY ||
      process.env.LITELLM_KEY ||
      process.env.LLMLITE_API_KEY ||
      process.env.LLMLITE_KEY ||
      process.env.AZURE_OPENAI_API_KEY ||
      process.env.AZURE_INFERENCE_CREDENTIAL
    )
  }

  return (
    process.env.LITELLM_API_KEY ||
    process.env.LITELLM_KEY ||
    process.env.LLMLITE_API_KEY ||
    process.env.LLMLITE_KEY
  )
}

export const getLlmModel = (requestedModel?: unknown) =>
  (typeof requestedModel === 'string' && requestedModel.trim()) ||
  process.env.AZURE_OPENAI_DEPLOYMENT ||
  process.env.LITELLM_MODEL ||
  process.env.LLMLITE_MODEL ||
  process.env.OPENAI_MODEL ||
  'gpt-4o-mini'

export const getLlmHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const apiKey = getLlmApiKey()
  if (!apiKey) return headers

  if (getLlmProvider() === 'azure') {
    headers['api-key'] = apiKey
  } else {
    headers['x-litellm-api-key'] = apiKey
  }

  return headers
}

export const getLlmTokenLimit = (limit: number) =>
  getLlmProvider() === 'azure'
    ? { max_completion_tokens: limit }
    : { max_tokens: limit }
