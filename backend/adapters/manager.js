import { SQLiteProvider } from './sqlite.js';
import { PostgreSQLProvider } from './postgres.js';
import { MongoDBProvider } from './mongodb.js';

class DatabaseManager {
  constructor() {
    this.providers = new Map();
    this.activeConnections = new Map();
  }

  async getProvider(dbType) {
    if (!this.providers.has(dbType)) {
      let provider;
      
      switch (dbType.toLowerCase()) {
        case 'sqlite':
          provider = new SQLiteProvider();
          break;
        case 'postgresql':
        case 'postgres':
          provider = new PostgreSQLProvider();
          break;
        case 'mongodb':
        case 'mongo':
          provider = new MongoDBProvider();
          break;
        default:
          throw new Error(`Unsupported database type: ${dbType}`);
      }

      await provider.initialize();
      this.providers.set(dbType, provider);
    }

    return this.providers.get(dbType);
  }

  async getDatabase(dbType, dbName, connectionString = null) {
    const provider = await this.getProvider(dbType);
    const connectionKey = `${dbType}_${dbName}_${connectionString || 'default'}`;
    
    if (!this.activeConnections.has(connectionKey)) {
      const database = provider.getDatabase(dbName, connectionString);
      this.activeConnections.set(connectionKey, { provider, database });
    }

    return this.activeConnections.get(connectionKey);
  }

  // Unified database interface methods
  async findUser(dbType, dbName, connectionString, query, projection = {}) {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.findUser(database, query, projection);
  }

  async insertUser(dbType, dbName, connectionString, userData) {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.insertUser(database, userData);
  }

  async updateUser(dbType, dbName, connectionString, query, update) {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.updateUser(database, query, update);
  }

  async findAuth(dbType, dbName, connectionString, query) {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.findAuth(database, query);
  }

  async insertAuth(dbType, dbName, connectionString, authData) {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.insertAuth(database, authData);
  }

  async executeQuery(dbType, dbName, connectionString, queryObject) {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.execute(database, queryObject);
  }

  async closeAll() {
    for (const provider of this.providers.values()) {
      await provider.closeAll();
    }
    this.providers.clear();
    this.activeConnections.clear();
  }
}

// Export singleton instance
export const databaseManager = new DatabaseManager();