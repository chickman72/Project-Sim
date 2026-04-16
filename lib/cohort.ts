import crypto from 'node:crypto'
import { getDatabase } from './cosmos'
import { getUserById, updateUser } from './user'

export interface Cohort {
  id: string
  name: string
  instructorId: string
  instructorIds?: string[]
  studentIds: string[]
  createdAt: string
  updatedAt: string
}

export const getCohortInstructorIds = (cohort: Pick<Cohort, 'instructorId' | 'instructorIds'>): string[] => {
  const normalized = Array.isArray(cohort.instructorIds)
    ? Array.from(new Set(cohort.instructorIds.map((id) => String(id || '').trim()).filter((id) => id.length > 0)))
    : []
  if (normalized.length > 0) return normalized
  const owner = String(cohort.instructorId || '').trim()
  return owner ? [owner] : []
}

export const canManageCohort = (cohort: Pick<Cohort, 'instructorId' | 'instructorIds'>, userId: string): boolean => {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) return false
  return getCohortInstructorIds(cohort).includes(normalizedUserId)
}

const normalizeCohortTags = (value: unknown): string[] => {
  const base = Array.isArray(value) ? value : []
  const trimmed = base
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0)
  const deduped = Array.from(new Set(trimmed))
  return deduped.includes('global') ? deduped : ['global', ...deduped]
}

const syncUserCohortTag = async (studentId: string, cohortId: string, enrolled: boolean) => {
  const user = await getUserById(studentId)
  if (!user) return

  const currentTags = normalizeCohortTags(user.cohorts)
  const targetTag = String(cohortId || '').trim()
  if (!targetTag || targetTag === 'global') return

  const nextTags = enrolled
    ? Array.from(new Set([...currentTags, targetTag]))
    : currentTags.filter((tag) => tag !== targetTag)

  const normalizedNextTags = normalizeCohortTags(nextTags)
  const changed =
    normalizedNextTags.length !== currentTags.length ||
    normalizedNextTags.some((tag, index) => tag !== currentTags[index])

  if (!changed) return

  await updateUser(studentId, { cohorts: normalizedNextTags })
}

export const getCohortsContainer = async () => {
  const db = await getDatabase()
  const { container } = await db.containers.createIfNotExists({
    id: 'cohorts',
    partitionKey: '/id'
  })
  return container
}

export const createCohort = async (name: string, instructorId: string): Promise<Cohort> => {
  const container = await getCohortsContainer()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const normalizedInstructorId = String(instructorId || '').trim()
  const cohort: Cohort = {
    id,
    name: name.trim(),
    instructorId: normalizedInstructorId,
    instructorIds: normalizedInstructorId ? [normalizedInstructorId] : [],
    studentIds: [],
    createdAt: now,
    updatedAt: now
  }
  await container.items.create(cohort)
  return cohort
}

export const getCohortById = async (id: string): Promise<Cohort | null> => {
  const container = await getCohortsContainer()
  try {
    const querySpec = {
      query: 'SELECT TOP 1 * FROM c WHERE c.id = @id',
      parameters: [{ name: '@id', value: id }]
    }
    const { resources } = await container.items.query(querySpec).fetchAll()
    return (resources?.[0] as Cohort) || null
  } catch {
    return null
  }
}

export const getCohortsByInstructor = async (instructorId: string): Promise<Cohort[]> => {
  const container = await getCohortsContainer()
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.instructorId = @instructorId OR ARRAY_CONTAINS(c.instructorIds, @instructorId) ORDER BY c.createdAt DESC',
    parameters: [{ name: '@instructorId', value: instructorId }]
  }
  const { resources } = await container.items.query(querySpec).fetchAll()
  return resources as Cohort[]
}

export const getCohortsByStudent = async (studentId: string): Promise<Cohort[]> => {
  const container = await getCohortsContainer()
  const querySpec = {
    query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(c.studentIds, @studentId)',
    parameters: [{ name: '@studentId', value: studentId }]
  }
  const { resources } = await container.items.query(querySpec).fetchAll()
  return resources as Cohort[]
}

export const updateCohort = async (
  id: string,
  updates: Partial<Pick<Cohort, 'name' | 'studentIds' | 'instructorIds'>>
): Promise<Cohort | null> => {
  const container = await getCohortsContainer()
  try {
    const existing = await getCohortById(id)
    if (!existing) return null
    const nextInstructorIds = Array.isArray(updates.instructorIds)
      ? Array.from(new Set(updates.instructorIds.map((item) => String(item || '').trim()).filter((item) => item.length > 0)))
      : getCohortInstructorIds(existing)
    const updated: Cohort = {
      ...existing,
      ...updates,
      instructorIds: nextInstructorIds,
      instructorId: nextInstructorIds[0] || existing.instructorId,
      updatedAt: new Date().toISOString()
    }
    await container.items.upsert(updated)
    return updated
  } catch {
    return null
  }
}

export const deleteCohort = async (id: string): Promise<boolean> => {
  const container = await getCohortsContainer()
  try {
    const cohort = await getCohortById(id)
    if (!cohort) return false

    const partitionCandidates = [cohort.instructorId, cohort.id]
    for (const pk of partitionCandidates) {
      try {
        await container.item(id, pk).delete()
        for (const studentId of cohort.studentIds || []) {
          try {
            await syncUserCohortTag(studentId, id, false)
          } catch (syncError) {
            console.error('Failed to sync user cohort tags after cohort deletion', { studentId, cohortId: id, syncError })
          }
        }
        return true
      } catch {
        // Try the next partition key candidate.
      }
    }

    return false
  } catch {
    return false
  }
}

export const addStudentToCohort = async (cohortId: string, studentId: string): Promise<Cohort | null> => {
  const cohort = await getCohortById(cohortId)
  if (!cohort) return null
  if (!cohort.studentIds.includes(studentId)) {
    cohort.studentIds.push(studentId)
  }
  const updated = await updateCohort(cohortId, { studentIds: cohort.studentIds })
  if (updated) {
    await syncUserCohortTag(studentId, cohortId, true)
  }
  return updated
}

export const removeStudentFromCohort = async (cohortId: string, studentId: string): Promise<Cohort | null> => {
  const cohort = await getCohortById(cohortId)
  if (!cohort) return null
  cohort.studentIds = cohort.studentIds.filter(id => id !== studentId)
  const updated = await updateCohort(cohortId, { studentIds: cohort.studentIds })
  if (updated) {
    await syncUserCohortTag(studentId, cohortId, false)
  }
  return updated
}

export const addInstructorToCohort = async (cohortId: string, instructorId: string): Promise<Cohort | null> => {
  const cohort = await getCohortById(cohortId)
  if (!cohort) return null
  const normalizedInstructorId = String(instructorId || '').trim()
  if (!normalizedInstructorId) return cohort
  const nextInstructorIds = Array.from(new Set([...getCohortInstructorIds(cohort), normalizedInstructorId]))
  return updateCohort(cohortId, { instructorIds: nextInstructorIds })
}

export const removeInstructorFromCohort = async (cohortId: string, instructorId: string): Promise<Cohort | null> => {
  const cohort = await getCohortById(cohortId)
  if (!cohort) return null
  const normalizedInstructorId = String(instructorId || '').trim()
  if (!normalizedInstructorId) return cohort
  const nextInstructorIds = getCohortInstructorIds(cohort).filter((id) => id !== normalizedInstructorId)
  if (nextInstructorIds.length === 0) {
    throw new Error('At least one instructor is required for each cohort')
  }
  return updateCohort(cohortId, { instructorIds: nextInstructorIds })
}
