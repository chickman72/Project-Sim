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
LLMLITE_URL=https://proxy-ai-anes-uabmc-awefchfueccrddhf.eastus2-01.azurewebsites.net/
# Usually required:
# LLMLITE_API_KEY=sk-...
# Optional if your proxy supports model selection:
# LLMLITE_MODEL=gpt-4o-mini

# App login (required):
# AUTH_PASSWORD=choose-a-password
# SESSION_SECRET=long-random-string
```

Features:
- Two-pane UI: Configuration (system prompt) and Simulation (chat)
- Sends POST to local `/api/chat`, which proxies to external AI endpoint
- Loading states and basic error handling

Auditing:
- Writes JSON audit records to `logs/interactions.json` (Power BI friendly)
- Also writes a per-event file to `logs/interaction-*.json`
