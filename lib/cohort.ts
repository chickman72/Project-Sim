import crypto from 'node:crypto'
import { getDatabase } from './cosmos'

export interface Cohort {
  id: string
  name: string
  instructorId: string
  studentIds: string[]
  createdAt: string
  updatedAt: string
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
  const cohort: Cohort = {
    id,
    name: name.trim(),
    instructorId,
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
    query: 'SELECT * FROM c WHERE c.instructorId = @instructorId ORDER BY c.createdAt DESC',
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

export const updateCohort = async (id: string, updates: Partial<Pick<Cohort, 'name' | 'studentIds'>>): Promise<Cohort | null> => {
  const container = await getCohortsContainer()
  try {
    const existing = await getCohortById(id)
    if (!existing) return null
    const updated: Cohort = {
      ...existing,
      ...updates,
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
  return updateCohort(cohortId, { studentIds: cohort.studentIds })
}

export const removeStudentFromCohort = async (cohortId: string, studentId: string): Promise<Cohort | null> => {
  const cohort = await getCohortById(cohortId)
  if (!cohort) return null
  cohort.studentIds = cohort.studentIds.filter(id => id !== studentId)
  return updateCohort(cohortId, { studentIds: cohort.studentIds })
}
