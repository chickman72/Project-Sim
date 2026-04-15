'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSetupsContainer } from '../../lib/cosmos'
import { getSessionCookieName, verifySessionToken } from '../../lib/auth'
import { logAdminAction } from '../../lib/audit-log'
import {
  deleteSimulationBlobByUrl,
  uploadSimulationDocumentToBlob,
  type UploadedSimulationDocument,
} from '../../lib/azure-rag'

type RubricCriterion = {
  id: string
  name: string
  successCondition: string
}

type KnowledgeBaseMode = 'standard' | 'strict_rag'

const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase()

const findUniqueCode = async () => {
  const container = await getSetupsContainer()
  for (let i = 0; i < 10; i += 1) {
    const nextCode = generateCode()
    try {
      const { resource } = await container.item(nextCode, nextCode).read()
      if (!resource) return nextCode
    } catch (error: any) {
      if (error?.code === 404) return nextCode
      throw error
    }
  }
  throw new Error('Unable to generate a unique simulation code. Please try again.')
}

export async function duplicateSimulation(originalId: string, newTitle: string) {
  const cookieStore = await cookies()
  const token = cookieStore.get(getSessionCookieName())?.value
  const session = verifySessionToken(token)

  if (!session) {
    throw new Error('Not authenticated')
  }

  const sourceId = String(originalId || '').trim()
  if (!sourceId) {
    throw new Error('Original simulation id is required')
  }

  const targetTitle = String(newTitle || '').trim()
  if (!targetTitle) {
    throw new Error('New simulation title is required')
  }

  const container = await getSetupsContainer()
  const { resource: original } = await container.item(sourceId, sourceId).read()
  if (!original) {
    throw new Error('Original simulation not found')
  }

  if (session.role !== 'Administrator' && original.userId !== session.userId) {
    throw new Error('You can only duplicate your own simulations')
  }

  const duplicateCode = await findUniqueCode()
  const duplicate = {
    id: duplicateCode,
    code: duplicateCode,
    title: targetTitle,
    description: String(original.description || ''),
    prompt: String(original.prompt || ''),
    patientVoice: typeof original.patientVoice === 'string' ? original.patientVoice : 'en-US-JennyNeural',
    visibility: original.visibility || (original.assignedCohortId ? 'cohort' : 'global'),
    assignedCohortId: original.assignedCohortId || undefined,
    isPracticeMode: false,
    conversationStarters: Array.isArray(original.conversationStarters)
      ? original.conversationStarters.map((item: any) => String(item || '')).filter((item: string) => item.trim().length > 0)
      : [],
    rubric: Array.isArray(original.rubric)
      ? original.rubric
          .map((item: any) => ({
            id: String(item?.id || '').trim(),
            name: String(item?.name || '').trim(),
            successCondition: String(item?.successCondition || '').trim(),
          }))
          .filter((item: RubricCriterion) => item.id && item.name && item.successCondition)
      : [],
    knowledgeBaseMode:
      original.knowledgeBaseMode === 'strict_rag' ? ('strict_rag' as KnowledgeBaseMode) : ('standard' as KnowledgeBaseMode),
    uploadedDocuments: [] as UploadedSimulationDocument[],
    userId: session.userId,
    updatedAt: new Date().toISOString(),
  }

  await container.items.create(duplicate)
  await logAdminAction(session.userId, 'CREATE_SIM', duplicateCode, {
    originalId: sourceId,
    originalTitle: original.title || '',
    duplicatedTitle: targetTitle,
    duplicatedAt: duplicate.updatedAt,
  })

  revalidatePath('/config')
  return { id: duplicateCode, code: duplicateCode, title: targetTitle }
}

const assertInstructorSimulationAccess = async (simulationId: string) => {
  const cookieStore = await cookies()
  const token = cookieStore.get(getSessionCookieName())?.value
  const session = verifySessionToken(token)

  if (!session) throw new Error('Not authenticated')

  const setupId = String(simulationId || '').trim()
  if (!setupId) throw new Error('simulationId is required')

  const container = await getSetupsContainer()
  const { resource } = await container.item(setupId, setupId).read()
  if (!resource) throw new Error('Simulation not found')

  if (session.role !== 'Administrator' && resource.userId !== session.userId) {
    throw new Error('You can only update your own simulations')
  }

  return { session, container, setupId, resource }
}

export async function uploadSimulationDocument(
  simulationId: string,
  formData: FormData,
  knowledgeBaseMode: KnowledgeBaseMode = 'strict_rag',
) {
  const { container, setupId, resource } = await assertInstructorSimulationAccess(simulationId)
  const multiFiles = formData
    .getAll('files')
    .filter((item): item is File => item instanceof File && item.size > 0)
  const singleFile = formData.get('file')
  const files =
    multiFiles.length > 0
      ? multiFiles
      : singleFile instanceof File && singleFile.size > 0
        ? [singleFile]
        : []

  if (files.length === 0) {
    throw new Error('At least one file is required')
  }

  const uploaded = await Promise.all(files.map((file) => uploadSimulationDocumentToBlob(setupId, file)))
  const currentDocuments = Array.isArray(resource.uploadedDocuments)
    ? resource.uploadedDocuments
        .map((item: any) => ({
          fileName: String(item?.fileName || '').trim(),
          blobUrl: String(item?.blobUrl || '').trim(),
        }))
        .filter((item: UploadedSimulationDocument) => item.fileName && item.blobUrl)
    : []

  const updatedDocuments = [...currentDocuments, ...uploaded]
  await container.items.upsert({
    ...resource,
    knowledgeBaseMode: knowledgeBaseMode === 'strict_rag' ? 'strict_rag' : 'standard',
    uploadedDocuments: updatedDocuments,
    updatedAt: new Date().toISOString(),
  })

  revalidatePath('/config')
  return uploaded
}

export async function deleteSimulationDocument(
  simulationId: string,
  blobUrl: string,
  knowledgeBaseMode?: KnowledgeBaseMode,
) {
  const { container, setupId, resource } = await assertInstructorSimulationAccess(simulationId)

  const targetBlobUrl = String(blobUrl || '').trim()
  if (!targetBlobUrl) throw new Error('blobUrl is required')

  await deleteSimulationBlobByUrl(targetBlobUrl)

  const currentDocuments = Array.isArray(resource.uploadedDocuments)
    ? resource.uploadedDocuments
        .map((item: any) => ({
          fileName: String(item?.fileName || '').trim(),
          blobUrl: String(item?.blobUrl || '').trim(),
        }))
        .filter((item: UploadedSimulationDocument) => item.fileName && item.blobUrl)
    : []

  const updatedDocuments = currentDocuments.filter(
    (item: UploadedSimulationDocument) => item.blobUrl !== targetBlobUrl,
  )
  await container.items.upsert({
    ...resource,
    knowledgeBaseMode:
      knowledgeBaseMode === 'strict_rag'
        ? 'strict_rag'
        : resource.knowledgeBaseMode === 'strict_rag'
          ? 'strict_rag'
          : 'standard',
    uploadedDocuments: updatedDocuments,
    updatedAt: new Date().toISOString(),
  })

  revalidatePath('/config')
  return { success: true, simulationId: setupId, blobUrl: targetBlobUrl }
}
