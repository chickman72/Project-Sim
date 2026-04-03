import crypto from 'node:crypto'
import { getUsersContainer } from './cosmos'

export type UserRole = 'Administrator' | 'Instructor' | 'Student'

export interface User {
  id: string
  username: string
  passwordHash: string
  role: UserRole
  createdAt: string
  updatedAt: string
}

const hashPassword = (password: string): string => {
  return crypto.createHash('sha256').update(password).digest('hex')
}

export const createUser = async (username: string, password: string, role: UserRole): Promise<User> => {
  const container = await getUsersContainer()
  const id = crypto.randomUUID()
  const user: User = {
    id,
    username: username.trim(),
    passwordHash: hashPassword(password),
    role,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  await container.items.create(user)
  return user
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

export const updateUser = async (id: string, updates: Partial<Pick<User, 'username' | 'passwordHash' | 'role'>>): Promise<User | null> => {
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
  const user = await getUserByUsername(username)
  if (!user) return null
  if (hashPassword(password) !== user.passwordHash) return null
  return user
}