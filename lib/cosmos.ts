import { CosmosClient } from '@azure/cosmos'

const endpoint = process.env.COSMOS_ENDPOINT || ''
const key = process.env.COSMOS_KEY || ''

let client: CosmosClient | null = null

if (endpoint && key) {
  client = new CosmosClient({ endpoint, key })
}

const dbName = 'project-sim-db'

export const getCosmosClient = () => client

export const getDatabase = async () => {
  if (!client) throw new Error('CosmosClient not initialized. Check COSMOS_ENDPOINT and COSMOS_KEY.')
  const { database } = await client.databases.createIfNotExists({ id: dbName })
  return database
}

export const getSetupsContainer = async () => {
  const db = await getDatabase()
  const { container } = await db.containers.createIfNotExists({
    id: 'setups',
    partitionKey: '/id'
  })
  return container
}

export const getLogsContainer = async () => {
  const db = await getDatabase()
  const { container } = await db.containers.createIfNotExists({
    id: 'logs',
    partitionKey: '/sessionId'
  })
  return container
}

export const getUsersContainer = async () => {
  const db = await getDatabase()
  const { container } = await db.containers.createIfNotExists({
    id: 'users'
  })
  return container
}

export const getTelemetryContainer = async () => {
  const db = await getDatabase()
  const { container } = await db.containers.createIfNotExists({
    id: 'telemetry',
    partitionKey: '/userId'
  })
  return container
}
