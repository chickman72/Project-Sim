import type { NextApiRequest, NextApiResponse } from 'next'
import { sendWelcomeOnboardingEmail } from 'lib/email-service'
import { getUserByUsername, getUserByEmail, updateUser, generateResetToken } from 'lib/user'

const getHeaderValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] || ''
  return value || ''
}

const getOriginFromUrl = (value: string) => {
  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

const buildResetUrl = (req: NextApiRequest, token: string) => {
  const configuredBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  const origin = getHeaderValue(req.headers.origin)
  const refererOrigin = getOriginFromUrl(getHeaderValue(req.headers.referer))
  const forwardedHost = getHeaderValue(req.headers['x-forwarded-host'])
  const forwardedProto = getHeaderValue(req.headers['x-forwarded-proto']) || 'https'
  const forwardedBase = forwardedHost ? `${forwardedProto}://${forwardedHost}` : ''
  const host = getHeaderValue(req.headers.host)
  const hostBase = host ? `${forwardedProto}://${host}` : ''
  const base = (configuredBase || origin || refererOrigin || forwardedBase || hostBase || 'http://localhost:3000').replace(/\/+$/, '')
  return `${base}/reset-password-token?token=${encodeURIComponent(token)}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const { usernameOrEmail } = req.body || {}

  if (typeof usernameOrEmail !== 'string' || !usernameOrEmail.trim()) {
    return res.status(400).json({ error: 'Username or email is required' })
  }

  try {
    // Try to find user by username first, then by email
    let user = await getUserByUsername(usernameOrEmail)
    if (!user) {
      user = await getUserByEmail(usernameOrEmail)
    }

    if (!user) {
      // Don't reveal whether user exists for security
      return res.status(200).json({
        success: true,
        message: 'If an account exists, a password reset link has been sent.'
      })
    }

    // Generate reset token (valid for 1 hour)
    const resetToken = generateResetToken()
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    await updateUser(user.id, {
      resetToken,
      resetTokenExpiry
    })

    const resetLink = buildResetUrl(req, resetToken)

    try {
      await sendWelcomeOnboardingEmail({
        appId: 'project-sim',
        to: user.email || user.username,
        subject: 'Reset your Project Sim password',
        templateData: {
          firstName: (user.email || user.username).split('@')[0] || 'there',
          productName: 'Project Sim',
          actionUrl: resetLink,
          previewText: 'Use this link to reset your Project Sim password.',
        },
      })
    } catch (emailError) {
      console.error('Failed sending Project Sim password reset email', {
        userId: user.id,
        message: emailError instanceof Error ? emailError.message : String(emailError),
        stack: emailError instanceof Error ? emailError.stack : undefined,
      })
      throw emailError
    }

    const isDevelopment = process.env.NODE_ENV !== 'production'
    const response: any = {
      success: true,
      message: 'If an account exists, a password reset link has been sent.'
    }

    if (isDevelopment) {
      response.resetLink = resetLink
    }

    return res.status(200).json(response)
  } catch (error) {
    console.error('Error requesting password reset:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
