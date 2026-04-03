"use client"

import { useCallback, useEffect, useRef, useState } from 'react'

type UsePatientVoiceOptions = {
  systemPrompt: string
}

const SAMPLE_RATE = 24000

const encodeBase64 = (data: ArrayBuffer) => {
  let binary = ''
  const bytes = new Uint8Array(data)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

const decodeBase64ToInt16 = (base64: string) => {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Int16Array(bytes.buffer)
}

const int16ToFloat32 = (data: Int16Array) => {
  const out = new Float32Array(data.length)
  for (let i = 0; i < data.length; i += 1) out[i] = data[i] / 32768
  return out
}

export function usePatientVoice({ systemPrompt }: UsePatientVoiceOptions) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isPatientSpeaking, setIsPatientSpeaking] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [directEnabled, setDirectEnabled] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const systemPromptRef = useRef(systemPrompt)
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hadSpeechRef = useRef(false)

  const ensureAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
    }
    return audioContextRef.current
  }

  const sendMessage = useCallback((payload: Record<string, any>) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(payload))
  }, [])

  const sendSessionUpdate = useCallback(
    (instructions: string) => {
      console.log('[voice] systemPrompt:', instructions)
      sendMessage({
        type: 'session.update',
        session: {
          instructions,
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          voice: 'alloy',
        },
      })
    },
    [sendMessage],
  )

  const playAudio = useCallback((chunk: Int16Array) => {
    if (!chunk.length) return
    const ctx = ensureAudioContext()
    if (ctx.state === 'suspended') ctx.resume()
    const audioBuffer = ctx.createBuffer(1, chunk.length, SAMPLE_RATE)
    audioBuffer.copyToChannel(int16ToFloat32(chunk), 0)
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current)
    source.start(startTime)
    nextPlayTimeRef.current = startTime + audioBuffer.duration
  }, [])

  const handleServerEvent = useCallback(
    (event: any) => {
      if (!event?.type) return
      if (event.type === 'response.audio.delta' || event.type === 'output_audio.delta') {
        const payload = event.delta || event.audio || ''
        if (!payload) return
        setIsPatientSpeaking(true)
        playAudio(decodeBase64ToInt16(payload))
        return
      }
      if (
        event.type === 'response.audio.done' ||
        event.type === 'output_audio.done' ||
        event.type === 'response.done'
      ) {
        setIsPatientSpeaking(false)
      }
    },
    [playAudio],
  )

  const connect = useCallback(async (instructions?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return
    if (instructions) {
      systemPromptRef.current = instructions
    }

    const publicWs = process.env.NEXT_PUBLIC_AZURE_OPENAI_REALTIME_WS_URL || ''
    const publicKey = process.env.NEXT_PUBLIC_AZURE_OPENAI_API_KEY || ''
    setDirectEnabled(Boolean(publicWs && publicKey))

    const openWebSocket = async (url: string) => {
      const ws = new WebSocket(url)
      wsRef.current = ws
      const ready = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup()
          reject(new Error('Voice socket timed out'))
        }, 4000)
        const handleOpen = () => {
          cleanup()
          resolve()
        }
        const handleError = () => {
          cleanup()
          reject(new Error('Voice socket failed to connect'))
        }
        const handleClose = () => {
          cleanup()
          reject(new Error('Voice socket closed before ready'))
        }
        const cleanup = () => {
          clearTimeout(timeout)
          ws.removeEventListener('open', handleOpen)
          ws.removeEventListener('error', handleError)
          ws.removeEventListener('close', handleClose)
        }
        ws.addEventListener('open', handleOpen)
        ws.addEventListener('error', handleError)
        ws.addEventListener('close', handleClose)
      })
      await ready
      return ws
    }

    const buildDirectUrl = () => {
      if (!publicWs || !publicKey) return ''
      const url = new URL(publicWs)
      if (!url.searchParams.has('api-key')) {
        url.searchParams.set('api-key', publicKey)
      }
      return url.toString()
    }

    const directUrl = buildDirectUrl()
    if (!directUrl) {
      throw new Error('Direct voice configuration missing')
    }
    const ws = await openWebSocket(directUrl)

    ws.addEventListener('open', () => {
      setIsConnected(true)
      sendSessionUpdate(systemPromptRef.current)
    })

    ws.addEventListener('message', (evt) => {
      try {
        const payload = JSON.parse(evt.data)
        handleServerEvent(payload)
      } catch {
        // ignore malformed payloads
      }
    })

    ws.addEventListener('close', (event) => {
      setIsConnected(false)
      setIsPatientSpeaking(false)
      setIsSpeaking(false)
    })

    ws.addEventListener('error', () => {
      setIsConnected(false)
    })

  }, [handleServerEvent, sendSessionUpdate])

  const disconnect = useCallback(() => {
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current)
      speakingTimeoutRef.current = null
    }
    hadSpeechRef.current = false
    setIsSpeaking(false)
    setIsPatientSpeaking(false)
    setIsConnected(false)
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  const commitAudio = useCallback(() => {
    sendSessionUpdate(systemPromptRef.current)
    sendMessage({ type: 'input_audio_buffer.commit' })
    sendMessage({
      type: 'response.create',
      response: {
        modalities: ['audio'],
      },
    })
  }, [sendMessage, sendSessionUpdate])

  const sendAudio = useCallback(
    (chunk: ArrayBuffer | Int16Array | Blob) => {
      const handleChunk = (pcm: ArrayBuffer) => {
        const view = new Int16Array(pcm)
        let sum = 0
        for (let i = 0; i < view.length; i += 1) {
          sum += Math.abs(view[i])
        }
        const avg = sum / Math.max(1, view.length)
        const speakingNow = avg > 80
        setIsSpeaking(speakingNow)

        const ws = wsRef.current
        if (!ws || ws.readyState !== WebSocket.OPEN) return

        sendMessage({
          type: 'input_audio_buffer.append',
          audio: encodeBase64(pcm),
        })

        if (speakingNow) {
          hadSpeechRef.current = true
        }

        if (speakingTimeoutRef.current) {
          clearTimeout(speakingTimeoutRef.current)
          speakingTimeoutRef.current = null
        }
        speakingTimeoutRef.current = setTimeout(() => {
          if (hadSpeechRef.current) {
            commitAudio()
            hadSpeechRef.current = false
          }
          setIsSpeaking(false)
        }, 900)
      }

      if (chunk instanceof Blob) {
        chunk.arrayBuffer().then(handleChunk).catch(() => null)
        return
      }
      if (chunk instanceof Int16Array) {
        handleChunk(chunk.buffer)
        return
      }
      handleChunk(chunk)
    },
    [commitAudio, sendMessage],
  )

  useEffect(() => {
    systemPromptRef.current = systemPrompt
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendSessionUpdate(systemPrompt)
    }
  }, [systemPrompt, sendSessionUpdate])

  return {
    connect,
    disconnect,
    sendAudio,
    isSpeaking,
    isPatientSpeaking,
    isConnected,
    directEnabled,
  }
}
