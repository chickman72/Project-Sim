import crypto from 'node:crypto'
import { getUsersContainer } from './cosmos'

export type UserRole =
  | 'Administrator'
  | 'Instructor'
  | 'Student'
  | 'admin'
  | 'instructor'
  | 'student'

export type AccessRole = 'admin' | 'instructor' | 'student'

export interface User {
  id: string
  username: string
  email?: string
  passwordHash: string
  role: UserRole
  cohorts?: string[]
  requiresPasswordChange?: boolean
  resetToken?: string
  resetTokenExpiry?: string
  inviteTokenHash?: string
  inviteTokenExpiry?: string
  inviteAcceptedAt?: string
  inviteCreatedBy?: string
  createdAt: string
  updatedAt: string
}

const hashPassword = (password: string): string => {
  return crypto.createHash('sha256').update(password).digest('hex')
}

export const generateTemporaryPassword = (): string => {
  return crypto.randomBytes(4).toString('hex')
}

export const generateResetToken = (): string => {
  return crypto.randomBytes(32).toString('hex')
}

export const getUserByResetToken = async (token: string): Promise<User | null> => {
  const container = await getUsersContainer()
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.resetToken = @token AND c.resetTokenExpiry > @now',
    parameters: [
      { name: '@token', value: token },
      { name: '@now', value: new Date().toISOString() }
    ]
  }
  const { resources } = await container.items.query(querySpec).fetchAll()
  return resources[0] as User || null
}

export const createUser = async (
  username: string,
  password: string,
  role: UserRole,
  requiresPasswordChange?: boolean,
  email?: string,
  cohorts: string[] = ['global']
): Promise<User> => {
  const container = await getUsersContainer()
  const id = crypto.randomUUID()
  const user: User = {
    id,
    username: username.trim(),
    email: email?.trim(),
    passwordHash: hashPassword(password),
    role,
    cohorts: Array.isArray(cohorts) && cohorts.length > 0 ? cohorts : ['global'],
    requiresPasswordChange: requiresPasswordChange === true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  await container.items.create(user)
  return user
}

export const getUserByEmail = async (email: string): Promise<User | null> => {
  const container = await getUsersContainer()
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.email = @email',
    parameters: [{ name: '@email', value: email }]
  }
  const { resources } = await container.items.query(querySpec).fetchAll()
  return resources[0] as User || null
}

export const getUserById = async (id: string): Promise<User | null> => {
  const container = await getUsersContainer()
  try {
    const { resource } = await container.item(id).read()
    return resource as User
  } catch {
    return null
  }
}

export const getUserByUsername = async (username: string): Promise<User | null> => {
  const container = await getUsersContainer()
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.username = @username',
    parameters: [{ name: '@username', value: username }]
  }
  const { resources } = await container.items.query(querySpec).fetchAll()
  return resources[0] as User || null
}

export const updateUser = async (
  id: string,
  updates: Partial<
    Pick<
      User,
      | 'username'
      | 'email'
      | 'passwordHash'
      | 'role'
      | 'cohorts'
      | 'requiresPasswordChange'
      | 'resetToken'
      | 'resetTokenExpiry'
      | 'inviteTokenHash'
      | 'inviteTokenExpiry'
      | 'inviteAcceptedAt'
      | 'inviteCreatedBy'
    >
  >,
): Promise<User | null> => {
  const container = await getUsersContainer()
  try {
    const { resource: existing } = await container.item(id).read()
    if (!existing) return null
    const updated: User = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    }
    await container.item(id).replace(updated)
    return updated
  } catch {
    return null
  }
}

export const deleteUser = async (id: string): Promise<boolean> => {
  const container = await getUsersContainer()
  try {
    await container.item(id).delete()
    return true
  } catch {
    return false
  }
}

export const listUsers = async (): Promise<User[]> => {
  const container = await getUsersContainer()
  const { resources } = await container.items.query('SELECT * FROM c').fetchAll()
  return resources as User[]
}

export const authenticateUser = async (username: string, password: string): Promise<User | null> => {
  const loginValue = username.trim()
  let user = await getUserByUsername(loginValue)
  if (!user && loginValue.includes('@')) {
    user = await getUserByEmail(loginValue)
  }
  if (!user) return null
  if (hashPassword(password) !== user.passwordHash) return null
  return user
}

export interface BulkImportResult {
  success: number
  failed: number
  failures: Array<{ name?: string; email: string; reason: string }>
}

export const bulkImportUsers = async (csvContent: string, role: UserRole = 'Student'): Promise<BulkImportResult> => {
  const lines = csvContent.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row')
  }

  const header = lines[0].toLowerCase().split(',').map(h => h.trim())
  const nameIndex = header.indexOf('name')
  const emailIndex = header.indexOf('email')

  if (nameIndex === -1 || emailIndex === -1) {
    throw new Error('CSV must have "name" and "email" columns')
  }

  const result: BulkImportResult = {
    success: 0,
    failed: 0,
    failures: []
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = line.split(',').map(f => f.trim())
    const name = fields[nameIndex]
    const email = fields[emailIndex]

    if (!name || !email) {
      result.failed++
      result.failures.push({
        name,
        email: email || `row-${i}`,
        reason: 'Name and email are required'
      })
      continue
    }

    try {
      // Check if user already exists by email
      const existing = await getUserByEmail(email)
      if (existing) {
        result.failed++
        result.failures.push({
          name,
          email,
          reason: 'User with this email already exists'
        })
        continue
      }

      // Generate temporary password
      const tempPassword = generateTemporaryPassword()
      
      // Create user with email as username
      await createUser(email, tempPassword, role, true)
      result.success++
    } catch (err) {
      result.failed++
      result.failures.push({
        name,
        email,
        reason: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }

  return result
}
