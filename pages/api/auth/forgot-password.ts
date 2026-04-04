import type { NextApiRequest, NextApiResponse } from 'next'
import { getUserByUsername, getUserByEmail, updateUser, generateResetToken } from 'lib/user'

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

    // In production, send email with reset link
    // For now, return the token in response (for development/testing)
    const isDevelopment = process.env.NODE_ENV !== 'production'
    const response: any = {
      success: true,
      message: 'If an account exists, a password reset link has been sent.'
    }

    if (isDevelopment) {
      response.resetLink = `/reset-password-token?token=${resetToken}`
    }

    return res.status(200).json(response)
  } catch (error) {
    console.error('Error requesting password reset:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
