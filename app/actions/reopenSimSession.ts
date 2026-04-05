'use server'

import { reopenSimSessionInternal } from '../../lib/evaluation'

export async function reopenSimSession(sessionId: string) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('Invalid sessionId')
  }

  await reopenSimSessionInternal(sessionId.trim())
  return { success: true }
}
