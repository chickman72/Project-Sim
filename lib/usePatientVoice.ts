"use client"

import { useCallback, useEffect, useRef, useState } from 'react'

type TranscriptRole = 'user' | 'assistant'

type UsePatientVoiceOptions = {
  systemPrompt: string
  patientVoice: string
  onTranscript?: (role: TranscriptRole, text: string) => void
  onError?: (message: string) => void
}

const TRANSCRIPT_IDLE_MS = 900

const appendTranscriptDelta = (current: string, delta: string) => {
  if (!current) return delta
  if (!delta) return current
  if (/^\s/.test(delta) || /\s$/.test(current)) return `${current}${delta}`
  if (/^[,.;:!?)]/.test(delta)) return `${current}${delta}`
  return `${current} ${delta}`
}

export function usePatientVoice({
  systemPrompt,
  patientVoice,
  onTranscript,
  onError,
}: UsePatientVoiceOptions) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isPatientSpeaking, setIsPatientSpeaking] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)

  const peerRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const microphoneRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const transcriptBuffersRef = useRef<Record<TranscriptRole, string>>({ user: '', assistant: '' })
  const transcriptTimersRef = useRef<Partial<Record<TranscriptRole, ReturnType<typeof setTimeout>>>>({})
  const userSpeakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const flushTranscript = useCallback((role: TranscriptRole) => {
    const timer = transcriptTimersRef.current[role]
    if (timer) clearTimeout(timer)
    delete transcriptTimersRef.current[role]

    const text = transcriptBuffersRef.current[role].trim()
    transcriptBuffersRef.current[role] = ''
    if (text) onTranscriptRef.current?.(role, text)
  }, [])

  const queueTranscript = useCallback(
    (role: TranscriptRole, delta: string) => {
      if (!delta) return
      transcriptBuffersRef.current[role] = appendTranscriptDelta(
        transcriptBuffersRef.current[role],
        delta,
      )
      const currentTimer = transcriptTimersRef.current[role]
      if (currentTimer) clearTimeout(currentTimer)
      transcriptTimersRef.current[role] = setTimeout(() => flushTranscript(role), TRANSCRIPT_IDLE_MS)
    },
    [flushTranscript],
  )

  const cleanup = useCallback(() => {
    flushTranscript('user')
    flushTranscript('assistant')
    if (speakingTimerRef.current) {
      clearTimeout(speakingTimerRef.current)
      speakingTimerRef.current = null
    }
    if (userSpeakingTimerRef.current) {
      clearTimeout(userSpeakingTimerRef.current)
      userSpeakingTimerRef.current = null
    }
    dataChannelRef.current?.close()
    dataChannelRef.current = null
    peerRef.current?.close()
    peerRef.current = null
    microphoneRef.current?.getTracks().forEach((track) => track.stop())
    microphoneRef.current = null
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause()
      remoteAudioRef.current.srcObject = null
      remoteAudioRef.current = null
    }
    setIsSpeaking(false)
    setIsPatientSpeaking(false)
    setIsConnected(false)
    setIsConnecting(false)
  }, [flushTranscript])

  const handleServerEvent = useCallback(
    (event: any) => {
      if (!event?.type) return

      if (event.type === 'session.input_transcript.delta') {
        setIsSpeaking(true)
        queueTranscript('user', String(event.delta || ''))
        if (userSpeakingTimerRef.current) clearTimeout(userSpeakingTimerRef.current)
        userSpeakingTimerRef.current = setTimeout(() => setIsSpeaking(false), 900)
        return
      }

      if (event.type === 'session.output_transcript.delta') {
        setIsPatientSpeaking(true)
        queueTranscript('assistant', String(event.delta || ''))
        if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current)
        speakingTimerRef.current = setTimeout(() => setIsPatientSpeaking(false), 1200)
        return
      }

      if (event.type === 'session.input_audio.muted') {
        setIsSpeaking(false)
        return
      }

      if (event.type === 'session.closed') {
        cleanup()
        return
      }

      if (event.type === 'error') {
        const message = event?.error?.message || 'GPT-Live voice session failed'
        onErrorRef.current?.(String(message))
      }
    },
    [cleanup, queueTranscript],
  )

  const connect = useCallback(async () => {
    if (peerRef.current || isConnecting) return
    setIsConnecting(true)

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser')
      }

      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      microphoneRef.current = microphone

      const peer = new RTCPeerConnection()
      peerRef.current = peer
      microphone.getAudioTracks().forEach((track) => peer.addTrack(track, microphone))

      const remoteAudio = new Audio()
      remoteAudio.autoplay = true
      remoteAudioRef.current = remoteAudio
      peer.addEventListener('track', (event) => {
        const [stream] = event.streams
        if (stream) {
          remoteAudio.srcObject = stream
          void remoteAudio.play().catch(() => null)
        }
      })

      const dataChannel = peer.createDataChannel('oai-events')
      dataChannelRef.current = dataChannel
      dataChannel.addEventListener('message', ({ data }) => {
        try {
          handleServerEvent(JSON.parse(String(data)))
        } catch {
          // Ignore malformed service events.
        }
      })
      dataChannel.addEventListener('open', () => {
        setIsConnected(true)
        setIsConnecting(false)
      })
      dataChannel.addEventListener('close', cleanup)

      peer.addEventListener('connectionstatechange', () => {
        if (peer.connectionState === 'connected') {
          setIsConnected(true)
          setIsConnecting(false)
        }
        if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) cleanup()
      })

      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      const offerSdp = peer.localDescription?.sdp || offer.sdp
      if (!offerSdp?.trim()) throw new Error('Browser did not create a voice session offer')

      const response = await fetch('/api/voice/live/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: offerSdp,
          instructions: systemPrompt,
          patientVoice,
        }),
      })

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `GPT-Live session failed (${response.status})`)
      }

      const answerSdp = await response.text()
      await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp })
      setIsConnected(true)
      setIsConnecting(false)
    } catch (error: any) {
      const message = error?.message || 'Unable to start GPT-Live voice session'
      cleanup()
      onErrorRef.current?.(message)
      throw error
    }
  }, [cleanup, handleServerEvent, isConnecting, patientVoice, systemPrompt])

  const disconnect = useCallback(() => {
    if (dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({ type: 'session.close' }))
    }
    cleanup()
  }, [cleanup])

  useEffect(() => cleanup, [cleanup])

  return {
    connect,
    disconnect,
    isSpeaking,
    isPatientSpeaking,
    isConnected,
    isConnecting,
  }
}
