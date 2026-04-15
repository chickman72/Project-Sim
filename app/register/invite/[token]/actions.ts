'use server'

import { redirect } from 'next/navigation'
import { acceptUserInvite } from '../../../config/user-actions'

const toErrorRedirect = (token: string, message: string) => {
  const params = new URLSearchParams({ error: message })
  redirect(`/register/invite/${encodeURIComponent(token)}?${params.toString()}`)
}

export async function completeInvitedUserRegistration(token: string, formData: FormData) {
  const fullName = String(formData.get('fullName') || '').trim()
  const password = String(formData.get('password') || '')
  const confirmPassword = String(formData.get('confirmPassword') || '')

  if (!fullName || !password || !confirmPassword) {
    toErrorRedirect(token, 'All fields are required.')
  }
  if (password.length < 8) {
    toErrorRedirect(token, 'Password must be at least 8 characters.')
  }
  if (password !== confirmPassword) {
    toErrorRedirect(token, 'Passwords do not match.')
  }

  try {
    await acceptUserInvite(token, fullName, password)
  } catch (error) {
    toErrorRedirect(token, error instanceof Error ? error.message : 'Failed to accept invite.')
  }

  const params = new URLSearchParams({
    success: '1',
    message: 'Registration complete. Please log in with your email and password.',
  })
  redirect(`/login?${params.toString()}`)
}
