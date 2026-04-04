'use server'

import { redirect } from 'next/navigation'
import { addStudentToCohort, getCohortById } from '../../../lib/cohort'
import { createUser, getUserByEmail, getUserByUsername } from '../../../lib/user'

const toErrorRedirect = (cohortId: string, message: string) => {
  const params = new URLSearchParams({ error: message })
  redirect(`/register/${encodeURIComponent(cohortId)}?${params.toString()}`)
}

export async function registerStudentForCohort(cohortId: string, formData: FormData) {
  const cohort = await getCohortById(cohortId)
  if (!cohort) {
    toErrorRedirect(cohortId, 'Invalid invite link. Cohort not found.')
  }

  const name = String(formData.get('name') || '').trim()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')
  const confirmPassword = String(formData.get('confirmPassword') || '')

  if (!name || !email || !password || !confirmPassword) {
    toErrorRedirect(cohortId, 'All fields are required.')
  }

  if (!email.includes('@')) {
    toErrorRedirect(cohortId, 'Please enter a valid email address.')
  }

  if (password.length < 8) {
    toErrorRedirect(cohortId, 'Password must be at least 8 characters.')
  }

  if (password !== confirmPassword) {
    toErrorRedirect(cohortId, 'Passwords do not match.')
  }

  const existingByEmail = await getUserByEmail(email)
  const existingByUsername = await getUserByUsername(email)
  if (existingByEmail || existingByUsername) {
    toErrorRedirect(cohortId, 'Account already exists. Please log in.')
  }

  const user = await createUser(name, password, 'Student', false, email)
  await addStudentToCohort(cohortId, user.id)

  const params = new URLSearchParams({
    success: '1',
    message: `Registration complete for ${cohort?.name || 'your class'}. Please log in.`,
  })
  redirect(`/login?${params.toString()}`)
}
