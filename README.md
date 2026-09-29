# Project Sim

Minimal Next.js + TypeScript + Tailwind scaffold for "Simulation Chatbot".

Run locally:

```bash
npm install
npm run dev
```

Environment:
- Create a `.env.local` with:

```
# LiteLLM proxy:
LITELLM_URL=https://your-litellm-proxy.example.com/
LITELLM_API_KEY=sk-...
LITELLM_MODEL=gpt-4o-mini

# Or Azure OpenAI / Microsoft Foundry (the project endpoint is accepted and
# normalized to the resource-level /openai/v1/chat/completions route):
# LITELLM_URL=https://your-resource.services.ai.azure.com/api/projects/your-project/
# LITELLM_API_KEY=your-resource-key
# LITELLM_MODEL=your-model-deployment-name

# The legacy LLMLITE_URL, LLMLITE_API_KEY, and LLMLITE_MODEL names are also supported.

# App login (required):
# AUTH_PASSWORD=choose-a-password
# SESSION_SECRET=long-random-string

# Azure Speech TTS (required for AI voice playback):
# AZURE_SPEECH_KEY=your-azure-speech-key
# AZURE_SPEECH_REGION=eastus

# Email microservice (required for invite and password reset emails):
# EMAIL_MICROSERVICE_API_KEY=your-secret-api-key
# EMAIL_MICROSERVICE_BASE_URL=https://blue-island-0357bf210.7.azurestaticapps.net
```

Features:
- Two-pane UI: Configuration (system prompt) and Simulation (chat)
- Sends POST to local `/api/chat`, which proxies to external AI endpoint
- Loading states and basic error handling

Auditing:
- Writes JSON audit records to `logs/interactions.json` (Power BI friendly)
- Also writes a per-event file to `logs/interaction-*.json`
