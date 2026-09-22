/**
 * PostgreSQL Database Configuration & Connection Pool
 * 
 * WHAT: Manages the PostgreSQL connection pool and query execution.
 * WHY: PostgreSQL is the single relational source of truth for students, attempts,
 *      tenants, users, competencies, and idempotency records.
 * WHAT PROBLEM IT PREVENTS: Prevents connection leaks, unhandled connection crashes,
 *      and credential leakage in error logs.
 */

const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const poolConfig = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'student_readiness',
  max: 20, // Maximum pool connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected pool error on idle client:', err.message);
});

/**
 * Execute a parameterized query with safe error logging.
 * NEVER exposes DB credentials or unparameterized user inputs.
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 500) {
      console.warn(`[PostgreSQL] Slow query (${duration}ms):`, text.substring(0, 80));
    }
    return res;
  } catch (err) {
    console.error('[PostgreSQL] Query error:', {
      message: err.message,
      code: err.code,
      query: text.substring(0, 100),
    });
    throw err;
  }
};

/**
 * Acquire a dedicated client for multi-statement ACID transactions.
 * Must call client.release() when finished.
 */
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

module.exports = {
  pool,
  query,
  getClient,
};
