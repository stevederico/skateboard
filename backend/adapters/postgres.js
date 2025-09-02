import pg from 'pg';

export class PostgreSQLProvider {
  constructor() {
    this.pools = new Map();
  }

  async initialize() {
    console.log('PostgreSQL provider initialized');
  }

  getDatabase(dbName, connectionString) {
    if (!this.pools.has(dbName)) {
      if (!connectionString) {
        throw new Error(`Connection string required for PostgreSQL database: ${dbName}`);
      }

      const pool = new pg.Pool({
        connectionString,
        ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.pools.set(dbName, pool);
      this.ensurePostgreSQLSchema(pool);
    }
    return this.pools.get(dbName);
  }

  async ensurePostgreSQLSchema(pool) {
    const client = await pool.connect();
    try {
      // Create Users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          _id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          subscription_stripeid TEXT,
          subscription_expires BIGINT,
          subscription_status TEXT
        )
      `);

      // Create Auths table
      await client.query(`
        CREATE TABLE IF NOT EXISTS auths (
          email TEXT PRIMARY KEY,
          password TEXT NOT NULL,
          userid TEXT NOT NULL,
          FOREIGN KEY (userid) REFERENCES users(_id)
        )
      `);

      // Create indexes
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_auths_email ON auths(email)`);
      
    } finally {
      client.release();
    }
  }

  async findUser(pool, query, projection = {}) {
    const { _id, email } = query;
    let sql = "SELECT * FROM users WHERE ";
    let params = [];
    
    if (_id) {
      sql += "_id = $1";
      params.push(_id);
    } else if (email) {
      sql += "email = $1";
      params.push(email);
    } else {
      return null;
    }

    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      if (result.rows.length === 0) return null;

      const user = result.rows[0];
      if (user.subscription_stripeid) {
        user.subscription = {
          stripeID: user.subscription_stripeid,
          expires: user.subscription_expires,
          status: user.subscription_status
        };
        delete user.subscription_stripeid;
        delete user.subscription_expires;
        delete user.subscription_status;
      }
      return user;
    } finally {
      client.release();
    }
  }

  async insertUser(pool, userData) {
    const { _id, email, name, created_at } = userData;
    const sql = "INSERT INTO users (_id, email, name, created_at) VALUES ($1, $2, $3, $4)";
    
    const client = await pool.connect();
    try {
      await client.query(sql, [_id, email, name, created_at]);
      return { insertedId: _id };
    } finally {
      client.release();
    }
  }

  async updateUser(pool, query, update) {
    const { _id } = query;
    const updateData = update.$set;
    
    const client = await pool.connect();
    try {
      if (updateData.subscription) {
        const { stripeID, expires, status } = updateData.subscription;
        const sql = `UPDATE users SET 
          subscription_stripeid = $1, 
          subscription_expires = $2, 
          subscription_status = $3 
          WHERE _id = $4`;
        const result = await client.query(sql, [stripeID, expires, status, _id]);
        return { modifiedCount: result.rowCount };
      } else {
        // Handle other updates
        const fields = Object.keys(updateData);
        if (fields.length === 0) return { modifiedCount: 0 };
        
        const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
        const values = fields.map(field => updateData[field]);
        values.push(_id);
        
        const sql = `UPDATE users SET ${setClause} WHERE _id = $${values.length}`;
        const result = await client.query(sql, values);
        return { modifiedCount: result.rowCount };
      }
    } finally {
      client.release();
    }
  }

  async findAuth(pool, query) {
    const { email } = query;
    const sql = "SELECT * FROM auths WHERE email = $1";
    
    const client = await pool.connect();
    try {
      const result = await client.query(sql, [email]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
  }

  async insertAuth(pool, authData) {
    const { email, password, userID } = authData;
    const sql = "INSERT INTO auths (email, password, userid) VALUES ($1, $2, $3)";
    
    const client = await pool.connect();
    try {
      await client.query(sql, [email, password, userID]);
      return { insertedId: email };
    } finally {
      client.release();
    }
  }

  async execute(pool, queryObject) {
    const startTime = Date.now();
    
    try {
      const { query, params = [], transaction } = queryObject;
      
      // Handle transactions
      if (transaction && Array.isArray(transaction)) {
        return this.executeTransaction(pool, transaction, startTime);
      }
      
      if (!query) {
        throw new Error('Query string is required');
      }

      const client = await pool.connect();
      try {
        const result = await client.query(query, params);
        
        // Determine if it's a SELECT query based on the result
        const isSelect = result.rows !== undefined;
        
        if (isSelect) {
          return {
            success: true,
            data: result.rows,
            rowCount: result.rows.length,
            metadata: {
              executionTime: Date.now() - startTime,
              dbType: 'postgresql'
            }
          };
        } else {
          // For INSERT, UPDATE, DELETE
          let data = {};
          if (result.rowCount !== undefined) {
            data.modifiedCount = result.rowCount;
            data.deletedCount = result.rowCount; // For DELETE queries
          }
          
          return {
            success: true,
            data,
            rowCount: result.rowCount || 0,
            metadata: {
              executionTime: Date.now() - startTime,
              dbType: 'postgresql'
            }
          };
        }
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code,
        metadata: {
          executionTime: Date.now() - startTime,
          dbType: 'postgresql'
        }
      };
    }
  }

  async executeTransaction(pool, operations, startTime) {
    const client = await pool.connect();
    
    try {
      const results = [];
      
      // PostgreSQL transaction
      await client.query('BEGIN');
      
      for (const operation of operations) {
        const { query, params = [] } = operation;
        const result = await client.query(query, params);
        
        results.push({
          query,
          rowCount: result.rowCount || 0,
          rows: result.rows || []
        });
      }
      
      await client.query('COMMIT');
      
      return {
        success: true,
        data: results,
        rowCount: results.reduce((sum, r) => sum + r.rowCount, 0),
        metadata: {
          executionTime: Date.now() - startTime,
          dbType: 'postgresql'
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async closeAll() {
    for (const [dbName, pool] of this.pools) {
      await pool.end();
    }
    this.pools.clear();
  }
}