"use client"

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk'

export type AvatarPlayerHandle = {
  speak: (text: string) => Promise<void>
}

type SpeechTokenResponse = {
  token: string
  region: string
}

type RelayTokenResponse = {
  iceServers?: Array<{
    urls?: string[] | string
    username?: string
    credential?: string
    password?: string
  }>
  urls?: string[] | string
  Urls?: string[] | string
  url?: string
  Url?: string
  username?: string
  Username?: string
  credential?: string
  Credential?: string
  password?: string
  Password?: string
}

const normalizeRelayUrls = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter((item) => item.length > 0)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []

    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('"[') && trimmed.endsWith(']"'))) {
      try {
        const parsed = JSON.parse(trimmed)
        return normalizeRelayUrls(parsed)
      } catch {
        // fall back to delimiter parsing
      }
    }

    return trimmed
      .split(/[,\s;|]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }

  return []
}

const extractUrlsFromRawRelayPayload = (payload: unknown): string[] => {
  const raw = JSON.stringify(payload || {})
  const matches = raw.match(/(?:turns?|stun):[^"',\]\s\\]+/gi) || []
  return Array.from(new Set(matches.map((item) => item.trim()).filter((item) => item.length > 0)))
}

const collectStringValues = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringValues(item))
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectStringValues(item))
  }
  return []
}

const firstNonEmptyString = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = firstNonEmptyString(item)
      if (candidate) return candidate
    }
    return ''
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const preferredKeys = [
      'value',
      'Value',
      'token',
      'Token',
      'username',
      'Username',
      'password',
      'Password',
      'credential',
      'Credential',
    ]
    for (const key of preferredKeys) {
      if (key in obj) {
        const candidate = firstNonEmptyString(obj[key])
        if (candidate) return candidate
      }
    }
    for (const inner of Object.values(obj)) {
      const candidate = firstNonEmptyString(inner)
      if (candidate) return candidate
    }
  }
  return ''
}

type Props = {
  voice?: string
  avatarCharacter?: string
  avatarStyle?: string
  onSpeakStart?: () => void
  onSpeakEnd?: () => void
  onError?: (message: string) => void
}

const AvatarPlayer = forwardRef<AvatarPlayerHandle, Props>(function AvatarPlayer(
  {
    voice = 'en-US-JennyNeural',
    avatarCharacter = 'lisa',
    avatarStyle = 'casual-sitting',
    onSpeakStart,
    onSpeakEnd,
    onError,
  },
  ref,
) {
  const [ready, setReady] = useState(false)
  const [statusText, setStatusText] = useState('Connecting avatar stream...')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const synthRef = useRef<SpeechSDK.AvatarSynthesizer | null>(null)
  const readyRef = useRef(false)
  const initErrorRef = useRef<string | null>(null)
  const onErrorRef = useRef<Props['onError']>(onError)
  const onSpeakStartRef = useRef<Props['onSpeakStart']>(onSpeakStart)
  const onSpeakEndRef = useRef<Props['onSpeakEnd']>(onSpeakEnd)

  useEffect(() => {
    onErrorRef.current = onError
    onSpeakStartRef.current = onSpeakStart
    onSpeakEndRef.current = onSpeakEnd
  }, [onError, onSpeakStart, onSpeakEnd])

  const reportError = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error || 'Avatar error')
      onErrorRef.current?.(message)
    },
    [],
  )

  const cleanup = useCallback(() => {
    setReady(false)
    readyRef.current = false
    setStatusText('Connecting avatar stream...')
    if (synthRef.current) {
      try {
        void synthRef.current.stopAvatarAsync().catch(() => null)
        void synthRef.current.close().catch(() => null)
      } catch {
        // ignore cleanup errors
      }
      synthRef.current = null
    }

    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null
        pcRef.current.getSenders().forEach((sender) => {
          try {
            sender.track?.stop()
          } catch {
            // ignore cleanup errors
          }
        })
        pcRef.current.close()
      } catch {
        // ignore cleanup errors
      }
      pcRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null
    }
  }, [])

  useEffect(() => {
    readyRef.current = ready
    if (ready) {
      setStatusText('Avatar connected')
    }
  }, [ready])

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      const assertNotCancelled = () => {
        if (cancelled) {
          throw new Error('Avatar initialization cancelled')
        }
      }

      cleanup()
      initErrorRef.current = null
      setStatusText('Connecting avatar stream...')
      try {
        const tokenResp = await fetch('/api/speech-token', { method: 'GET' })
        assertNotCancelled()
        if (!tokenResp.ok) {
          const detail = await tokenResp.text()
          throw new Error(detail || `Speech token request failed (${tokenResp.status})`)
        }
        const tokenData = (await tokenResp.json()) as SpeechTokenResponse
        assertNotCancelled()
        if (!tokenData?.token || !tokenData?.region) {
          throw new Error('Invalid token response from /api/speech-token')
        }

        const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
          tokenData.token,
          tokenData.region,
        )
        speechConfig.speechSynthesisVoiceName = voice

        const relayResp = await fetch('/api/avatar-relay', { method: 'GET' })
        assertNotCancelled()
        if (!relayResp.ok) {
          const detail = await relayResp.text()
          throw new Error(detail || `Avatar relay token request failed (${relayResp.status})`)
        }
        const relayData = (await relayResp.json()) as RelayTokenResponse
        assertNotCancelled()
        const relayKeys = Object.keys((relayData as Record<string, unknown>) || {})

        const normalizedIceServers: RTCIceServer[] = []
        if (Array.isArray(relayData.iceServers)) {
          for (const server of relayData.iceServers) {
            const rawUrls = normalizeRelayUrls(server.urls)
            if (!rawUrls.length) continue
            normalizedIceServers.push({
              urls: rawUrls,
              username: server.username || '',
              credential: server.credential || server.password || '',
            })
          }
        }

        if (normalizedIceServers.length === 0) {
          const urlsFromUpper = normalizeRelayUrls(relayData.Urls)
          const urlsFromLower = normalizeRelayUrls(relayData.urls)
          const urlsFromObject = collectStringValues(relayData.Urls)
            .concat(collectStringValues(relayData.urls))
            .flatMap((item) => normalizeRelayUrls(item))
          const urls = [
            ...urlsFromUpper,
            ...urlsFromLower,
            ...urlsFromObject,
            ...normalizeRelayUrls(relayData.Url),
            ...normalizeRelayUrls(relayData.url),
          ]
          const username = firstNonEmptyString(relayData.Username || relayData.username)
          const credential = firstNonEmptyString(
            relayData.Credential || relayData.credential || relayData.Password || relayData.password,
          )
          if (urls.length) {
            normalizedIceServers.push({ urls, username, credential })
          }
        }

        if (normalizedIceServers.length === 0) {
          const fallbackUrls = extractUrlsFromRawRelayPayload(relayData)
          const username = firstNonEmptyString(relayData.Username || relayData.username)
          const credential = firstNonEmptyString(
            relayData.Credential || relayData.credential || relayData.Password || relayData.password,
          )
          if (fallbackUrls.length) {
            normalizedIceServers.push({ urls: fallbackUrls, username, credential })
          }
        }

        if (!normalizedIceServers.length) {
          const username = firstNonEmptyString(relayData.Username || relayData.username)
          const credential = firstNonEmptyString(
            relayData.Credential || relayData.credential || relayData.Password || relayData.password,
          )
          if (username && credential) {
            normalizedIceServers.push({
              urls: [
                'turn:relay.communication.microsoft.com:3478',
                'turns:relay.communication.microsoft.com:443',
              ],
              username,
              credential,
            })
          }
        }

        const peerConnection =
          normalizedIceServers.length > 0
            ? new RTCPeerConnection({ iceServers: normalizedIceServers })
            : new RTCPeerConnection()
        assertNotCancelled()
        if (normalizedIceServers.length === 0) {
          console.warn(
            `[avatar] Relay token had no parseable ICE URLs (keys: ${
              relayKeys.join(', ') || 'none'
            }). Falling back to default WebRTC ICE.`,
          )
        }
        pcRef.current = peerConnection

        peerConnection.ontrack = (event) => {
          if (event.track.kind === 'video' && videoRef.current) {
            videoRef.current.srcObject = event.streams[0]
          }
          if (event.track.kind === 'audio' && audioRef.current) {
            audioRef.current.srcObject = event.streams[0]
          }
        }

        peerConnection.addTransceiver('video', { direction: 'sendrecv' })
        peerConnection.addTransceiver('audio', { direction: 'sendrecv' })

        const avatarConfig = new SpeechSDK.AvatarConfig(
          avatarCharacter,
          avatarStyle,
          new SpeechSDK.AvatarVideoFormat(),
        )
        const synthesizer = new SpeechSDK.AvatarSynthesizer(speechConfig, avatarConfig)
        assertNotCancelled()
        synthRef.current = synthesizer

        const startResult = await synthesizer.startAvatarAsync(peerConnection)
        assertNotCancelled()
        if (startResult.reason === SpeechSDK.ResultReason.Canceled) {
          throw new Error(startResult.errorDetails || 'Avatar WebRTC session was canceled by Azure')
        }
        if (!cancelled) {
          setReady(true)
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'Avatar initialization cancelled') {
          cleanup()
          return
        }
        if (!cancelled) {
          initErrorRef.current = error instanceof Error ? error.message : String(error || 'Avatar init failed')
          cleanup()
          setStatusText('Avatar failed to connect')
          reportError(error)
        }
      }
    }

    void initialize()
    return () => {
      cancelled = true
      cleanup()
    }
  }, [avatarCharacter, avatarStyle, cleanup, reportError, voice])

  const waitForReady = useCallback(async (timeoutMs = 20000) => {
    if (readyRef.current) return true
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      if (readyRef.current) return true
    }
    return readyRef.current
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      speak: async (text: string) => {
        const content = text.trim()
        if (!content) return
        const isReady = await waitForReady(20000)
        const synthesizer = synthRef.current
        if (!synthesizer || !isReady) {
          throw new Error(
            initErrorRef.current ||
              'Avatar is still connecting. The text response is available in chat, but video speech is not ready yet.',
          )
        }

        onSpeakStartRef.current?.()
        try {
          const result = await synthesizer.speakTextAsync(content)
          if (result.reason !== SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            throw new Error(`Avatar speech failed: ${String(result.reason)}`)
          }
        } finally {
          onSpeakEndRef.current?.()
        }
      },
    }),
    [waitForReady],
  )

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 text-sm font-semibold text-gray-800">Patient Video</div>
      <video
        id="avatar-video"
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className="w-full rounded-lg border border-gray-200 bg-gray-900 aspect-video object-cover"
      />
      <audio ref={audioRef} autoPlay />
      {!ready && (
        <div className="mt-2 text-xs text-gray-600">{statusText}</div>
      )}
    </div>
  )
})

export default AvatarPlayer
