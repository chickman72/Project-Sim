import { AzureKeyCredential } from '@azure/core-auth'
import { SearchClient } from '@azure/search-documents'
import { BlobServiceClient } from '@azure/storage-blob'

export type UploadedSimulationDocument = {
  fileName: string
  blobUrl: string
}

const getStorageConfig = () => {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  const containerName = process.env.AZURE_STORAGE_CONTAINER

  if (!connectionString) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not configured')
  if (!containerName) throw new Error('AZURE_STORAGE_CONTAINER is not configured')

  return { connectionString, containerName }
}

const getSearchConfig = () => {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT
  const indexName = process.env.AZURE_SEARCH_INDEX
  const apiKey = process.env.AZURE_SEARCH_KEY

  if (!endpoint) throw new Error('AZURE_SEARCH_ENDPOINT is not configured')
  if (!indexName) throw new Error('AZURE_SEARCH_INDEX is not configured')
  if (!apiKey) throw new Error('AZURE_SEARCH_KEY is not configured')

  return { endpoint, indexName, apiKey }
}

const sanitizeFileName = (value: string) => {
  const base = value.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_')
  return base || 'document.bin'
}

const getContainerClient = () => {
  const { connectionString, containerName } = getStorageConfig()
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  return blobServiceClient.getContainerClient(containerName)
}

export async function uploadSimulationDocumentToBlob(
  simulationId: string,
  file: File,
): Promise<UploadedSimulationDocument> {
  const trimmedSimulationId = String(simulationId || '').trim()
  if (!trimmedSimulationId) throw new Error('simulationId is required')

  if (!file) throw new Error('No file provided')
  if (file.size <= 0) throw new Error('File is empty')

  const containerClient = getContainerClient()
  await containerClient.createIfNotExists()

  const safeFileName = sanitizeFileName(file.name)
  const blobName = `${trimmedSimulationId}/${Date.now()}-${safeFileName}`
  const blockBlobClient = containerClient.getBlockBlobClient(blobName)
  const buffer = Buffer.from(await file.arrayBuffer())

  await blockBlobClient.uploadData(buffer, {
    metadata: { simulationId: trimmedSimulationId },
    blobHTTPHeaders: {
      blobContentType: file.type || 'application/octet-stream',
    },
  })

  return {
    fileName: file.name,
    blobUrl: blockBlobClient.url,
  }
}

export async function deleteSimulationBlobByUrl(blobUrl: string) {
  const trimmedBlobUrl = String(blobUrl || '').trim()
  if (!trimmedBlobUrl) throw new Error('blobUrl is required')

  const containerClient = getContainerClient()
  const targetUrl = new URL(trimmedBlobUrl)
  const [, containerName, ...blobSegments] = targetUrl.pathname.split('/')
  const blobName = decodeURIComponent(blobSegments.join('/'))

  if (!containerName || containerName !== containerClient.containerName || !blobName) {
    throw new Error('blobUrl does not match the configured storage container')
  }

  const blobClient = containerClient.getBlobClient(blobName)
  await blobClient.deleteIfExists({ deleteSnapshots: 'include' })
}

export async function retrieveSimulationContext(query: string, simulationId: string): Promise<string> {
  const trimmedSimulationId = String(simulationId || '').trim()
  if (!trimmedSimulationId) return ''

  const { endpoint, indexName, apiKey } = getSearchConfig()
  const credential = new AzureKeyCredential(apiKey)
  const client = new SearchClient<{ content?: string }>(endpoint, indexName, credential)
  const safeSimulationId = trimmedSimulationId.replace(/'/g, "''")

  const searchResults = await client.search(query, {
    top: 5,
    filter: "simulationId eq '" + safeSimulationId + "'",
    select: ['content'],
  })

  const chunks: string[] = []
  for await (const result of searchResults.results) {
    const content = typeof result.document?.content === 'string' ? result.document.content.trim() : ''
    if (content) chunks.push(content)
    if (chunks.length >= 5) break
  }

  return chunks.slice(0, 5).join('\n\n')
}
