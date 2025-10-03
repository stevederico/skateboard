import { DatabaseSync as Database } from "node:sqlite";
import { mkdir } from 'node:fs';
import { promisify } from 'node:util';

export class SQLiteProvider {
  constructor() {
    this.databases = new Map();
  }

  async initialize() {
    await this.initializeSQLite();
  }

  async initializeSQLite() {
    // Create databases directory if it doesn't exist
    try {
      await promisify(mkdir)('./databases', { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') {
        console.error("Failed to create databases directory:", err);
      }
    }
  }

  async ensureSQLiteSchema(db) {
    // Create Users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS Users (
        _id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        subscription_stripeID TEXT,
        subscription_expires INTEGER,
        subscription_status TEXT
      )
    `);

    // Create Auths table
    db.exec(`
      CREATE TABLE IF NOT EXISTS Auths (
        email TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        userID TEXT NOT NULL,
        FOREIGN KEY (userID) REFERENCES Users(_id)
      )
    `);

    // Create indexes
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON Users(email)`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_auths_email ON Auths(email)`);
  }

  getDatabase(dbName, connectionString = null) {
    if (!this.databases.has(dbName)) {
      const dbPath = connectionString || `./databases/${dbName}.db`;
      const db = new Database(dbPath);
      
      // Enable WAL mode for better concurrency and performance
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('PRAGMA synchronous = NORMAL');
      db.exec('PRAGMA cache_size = 1000');
      db.exec('PRAGMA temp_store = memory');
      
      this.ensureSQLiteSchema(db);
      this.databases.set(dbName, db);
    }
    return this.databases.get(dbName);
  }

  async findUser(db, query, projection = {}) {
    const { _id, email } = query;
    let sql = "SELECT * FROM Users WHERE ";
    let params = [];
    
    if (_id) {
      sql += "_id = ?";
      params.push(_id);
    } else if (email) {
      sql += "email = ?";
      params.push(email);
    } else {
      return null;
    }

    const result = db.prepare(sql).get(...params);
    if (result && result.subscription_stripeID) {
      result.subscription = {
        stripeID: result.subscription_stripeID,
        expires: result.subscription_expires,
        status: result.subscription_status
      };
      delete result.subscription_stripeID;
      delete result.subscription_expires;
      delete result.subscription_status;
    }
    return result;
  }

  async insertUser(db, userData) {
    const { _id, email, name, created_at } = userData;
    const sql = "INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)";
    db.prepare(sql).run(_id, email, name, created_at);
    return { insertedId: _id };
  }

  async updateUser(db, query, update) {
    const { _id } = query;
    const updateData = update.$set;

    // Whitelist of allowed fields to prevent SQL injection
    const ALLOWED_FIELDS = ['name', 'email', 'created_at', 'subscription_stripeID', 'subscription_expires', 'subscription_status'];

    if (updateData.subscription) {
      const { stripeID, expires, status } = updateData.subscription;
      const sql = `UPDATE Users SET
        subscription_stripeID = ?,
        subscription_expires = ?,
        subscription_status = ?
        WHERE _id = ?`;
      const result = db.prepare(sql).run(stripeID, expires, status, _id);
      return { modifiedCount: result.changes };
    } else {
      // Handle other updates with field validation
      const fields = Object.keys(updateData).filter(field => ALLOWED_FIELDS.includes(field));
      if (fields.length === 0) return { modifiedCount: 0 };

      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => updateData[field]);
      values.push(_id);

      const sql = `UPDATE Users SET ${setClause} WHERE _id = ?`;
      const result = db.prepare(sql).run(...values);
      return { modifiedCount: result.changes };
    }
  }

  async findAuth(db, query) {
    const { email } = query;
    const sql = "SELECT * FROM Auths WHERE email = ?";
    return db.prepare(sql).get(email);
  }

  async insertAuth(db, authData) {
    const { email, password, userID } = authData;
    const sql = "INSERT INTO Auths (email, password, userID) VALUES (?, ?, ?)";
    db.prepare(sql).run(email, password, userID);
    return { insertedId: email };
  }

  async execute(db, queryObject) {
    const startTime = Date.now();
    
    try {
      const { query, params = [], transaction } = queryObject;
      
      // Handle transactions
      if (transaction && Array.isArray(transaction)) {
        return this.executeTransaction(db, transaction, startTime);
      }
      
      if (!query) {
        throw new Error('Query string is required');
      }

      // Determine if it's a SELECT query or modification query
      const isSelect = query.trim().toUpperCase().startsWith('SELECT');
      
      if (isSelect) {
        // Use .all() for SELECT queries to get all results
        const stmt = db.prepare(query);
        const data = stmt.all(...params);
        
        return {
          success: true,
          data,
          rowCount: data.length,
          metadata: {
            executionTime: Date.now() - startTime,
            dbType: 'sqlite'
          }
        };
      } else {
        // Use .run() for INSERT, UPDATE, DELETE
        const stmt = db.prepare(query);
        const result = stmt.run(...params);
        
        let data = {};
        if (result.lastInsertRowid) {
          data.insertedId = result.lastInsertRowid;
        }
        if (result.changes !== undefined) {
          data.modifiedCount = result.changes;
          data.deletedCount = result.changes; // For DELETE queries
        }
        
        return {
          success: true,
          data,
          rowCount: result.changes || 0,
          metadata: {
            executionTime: Date.now() - startTime,
            dbType: 'sqlite'
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code,
        metadata: {
          executionTime: Date.now() - startTime,
          dbType: 'sqlite'
        }
      };
    }
  }

  async executeTransaction(db, operations, startTime) {
    try {
      const results = [];
      
      // SQLite transaction
      db.exec('BEGIN TRANSACTION');
      
      for (const operation of operations) {
        const { query, params = [] } = operation;
        const stmt = db.prepare(query);
        const result = stmt.run(...params);
        
        results.push({
          query,
          changes: result.changes || 0,
          lastInsertRowid: result.lastInsertRowid || null
        });
      }
      
      db.exec('COMMIT');
      
      return {
        success: true,
        data: results,
        rowCount: results.reduce((sum, r) => sum + r.changes, 0),
        metadata: {
          executionTime: Date.now() - startTime,
          dbType: 'sqlite'
        }
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  closeAll() {
    for (const [dbName, db] of this.databases) {
      db.close();
    }
    this.databases.clear();
  }
}