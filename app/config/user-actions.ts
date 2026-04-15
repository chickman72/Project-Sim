'use server'

import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { getSessionCookieName, verifySessionToken } from '../../lib/auth'
import { getCohortsContainer } from '../../lib/cohort'
import { getUsersContainer } from '../../lib/cosmos'
import { createUser, getUserByEmail, listUsers, updateUser, type AccessRole, type User } from '../../lib/user'

export type UserDashboardItem = {
  id: string
  email: string
  role: AccessRole
  cohorts: string[]
  cohortDisplayNames: string[]
}

const toAccessRole = (role: unknown): AccessRole => {
  const raw = String(role || '').trim().toLowerCase()
  if (raw === 'admin' || raw === 'administrator') return 'admin'
  if (raw === 'instructor') return 'instructor'
  return 'student'
}

const normalizeCohorts = (value: unknown): string[] => {
  const base = Array.isArray(value) ? value : []
  const trimmed = base
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0)
  const deduped = Array.from(new Set(trimmed))
  return deduped.length > 0 ? deduped : ['global']
}

const normalizeEmail = (value: unknown): string => String(value || '').trim().toLowerCase()

const requireInstructorOrAdmin = async () => {
  const cookieStore = await cookies()
  const token = cookieStore.get(getSessionCookieName())?.value
  const session = verifySessionToken(token)
  if (!session || (session.role !== 'Instructor' && session.role !== 'Administrator')) {
    throw new Error('Forbidden')
  }
  return session
}

const toDashboardItem = (user: User, cohortNameMap: Map<string, string>): UserDashboardItem | null => {
  const email = normalizeEmail(user.email || user.username)
  if (!email) return null
  const cohorts = normalizeCohorts(user.cohorts)
  return {
    id: user.id,
    email,
    role: toAccessRole(user.role),
    cohorts,
    cohortDisplayNames: cohorts.map((cohortId) => cohortNameMap.get(cohortId) || cohortId),
  }
}

const getCohortNameMap = async () => {
  const container = await getCohortsContainer()
  const querySpec = {
    query: 'SELECT c.id, c.name FROM c',
  }
  const { resources } = await container.items.query(querySpec).fetchAll()
  const map = new Map<string, string>()
  for (const item of resources as Array<{ id?: string; name?: string }>) {
    const id = String(item?.id || '').trim()
    const name = String(item?.name || '').trim()
    if (id) map.set(id, name || id)
  }
  return map
}

export async function getUsersByCohort(): Promise<UserDashboardItem[]> {
  await requireInstructorOrAdmin()
  const cohortNameMap = await getCohortNameMap()
  const users = await listUsers()
  return users
    .map((user) => toDashboardItem(user, cohortNameMap))
    .filter((user): user is UserDashboardItem => Boolean(user))
    .sort((a, b) => a.email.localeCompare(b.email))
}

export async function updateUserCohorts(userId: string, newCohorts: string[]) {
  await requireInstructorOrAdmin()
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) throw new Error('userId is required')

  const updated = await updateUser(normalizedUserId, { cohorts: normalizeCohorts(newCohorts) })
  if (!updated) throw new Error('User not found')
  const cohortNameMap = await getCohortNameMap()
  const mapped = toDashboardItem(updated, cohortNameMap)
  if (!mapped) throw new Error('User is missing required fields')
  return mapped
}

const buildInviteUrl = (token: string) => {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  return `${base.replace(/\/+$/, '')}/register/invite/${encodeURIComponent(token)}`
}

export async function generateUserInvite(email: string, role: string, cohorts: string[]) {
  const session = await requireInstructorOrAdmin()
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Valid email is required')
  }

  const normalizedRole = toAccessRole(role)
  if (normalizedRole === 'admin' && session.role !== 'Administrator') {
    throw new Error('Only administrators can invite users as admin')
  }
  const normalizedCohorts = normalizeCohorts(cohorts)

  const inviteToken = crypto.randomBytes(32).toString('hex')
  const inviteTokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex')
  const inviteTokenExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()

  const existing = await getUserByEmail(normalizedEmail)
  if (existing) {
    const updated = await updateUser(existing.id, {
      role: normalizedRole,
      cohorts: normalizedCohorts,
      inviteTokenHash,
      inviteTokenExpiry,
      inviteCreatedBy: session.userId,
      inviteAcceptedAt: undefined,
      email: normalizedEmail,
    })
    if (!updated) throw new Error('Failed to update existing user invite')
  } else {
    // Shell account with a random unknown password until invite is accepted.
    const shellPassword = crypto.randomBytes(24).toString('hex')
    const created = await createUser(normalizedEmail, shellPassword, normalizedRole, true, normalizedEmail, normalizedCohorts)
    await updateUser(created.id, {
      inviteTokenHash,
      inviteTokenExpiry,
      inviteCreatedBy: session.userId,
      inviteAcceptedAt: undefined,
      role: normalizedRole,
      cohorts: normalizedCohorts,
    })
  }

  return {
    inviteUrl: buildInviteUrl(inviteToken),
    expiresAt: inviteTokenExpiry,
  }
}

export async function getPendingInvite(token: string) {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken) return null

  const tokenHash = crypto.createHash('sha256').update(normalizedToken).digest('hex')
  const usersContainer = await getUsersContainer()
  const querySpec = {
    query:
      'SELECT TOP 1 c.id, c.email, c.role, c.cohorts, c.inviteTokenExpiry FROM c WHERE c.inviteTokenHash = @hash AND c.inviteTokenExpiry > @now',
    parameters: [
      { name: '@hash', value: tokenHash },
      { name: '@now', value: new Date().toISOString() },
    ],
  }
  const { resources } = await usersContainer.items.query(querySpec).fetchAll()
  if (!resources || resources.length === 0) return null

  const row: any = resources[0]
  return {
    userId: String(row.id || ''),
    email: normalizeEmail(row.email),
    role: toAccessRole(row.role),
    cohorts: normalizeCohorts(row.cohorts),
    expiresAt: String(row.inviteTokenExpiry || ''),
  }
}

export async function acceptUserInvite(token: string, fullName: string, password: string) {
  const normalizedToken = String(token || '').trim()
  const normalizedName = String(fullName || '').trim()
  const normalizedPassword = String(password || '')

  if (!normalizedToken) throw new Error('Invalid invite token')
  if (!normalizedName) throw new Error('Full name is required')
  if (normalizedPassword.length < 8) throw new Error('Password must be at least 8 characters')

  const pending = await getPendingInvite(normalizedToken)
  if (!pending) throw new Error('Invite is invalid or expired')

  const userWithSameName = (await listUsers()).find(
    (user) => user.username.trim().toLowerCase() === normalizedName.toLowerCase() && user.id !== pending.userId,
  )
  if (userWithSameName) {
    throw new Error('Display name is already in use. Please choose a different name.')
  }

  const passwordHash = crypto.createHash('sha256').update(normalizedPassword).digest('hex')
  const updated = await updateUser(pending.userId, {
    username: normalizedName,
    passwordHash,
    requiresPasswordChange: false,
    inviteAcceptedAt: new Date().toISOString(),
    inviteTokenHash: undefined,
    inviteTokenExpiry: undefined,
  })

  if (!updated) throw new Error('Failed to accept invite')
  return { success: true }
}
