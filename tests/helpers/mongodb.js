import { MongoMemoryServer } from 'mongodb-memory-server';

// Real mongod in an isolated temporary database. Tests never use the Atlas URI.
export async function startTestDatabase(dbName) {
  const database = await MongoMemoryServer.create({ instance: { dbName } });
  return { database, config: {
    mongoUri: database.getUri(), dbName, demo: true,
    sessionSecret: 'nodo-integration-test-session-secret-2026',
    adminEmail: 'admin@nodo.local', adminPassword: 'Admin@12345',
  } };
}
