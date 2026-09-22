/**
 * PostgreSQL Database Migration Runner
 * 
 * WHAT: Executes SQL migrations to set up the multi-tenant relational schema.
 * WHY: Establishes the authoritative schema for tenants, users, students, competencies,
 *      attempts, idempotency records, and transactional outbox events.
 * WHAT PROBLEM IT PREVENTS: Eliminates schema drift, ensures missing tables or constraints
 *      are created consistently across environments.
 */

const fs = require('fs');
const path = require('path');
const { pool, getClient } = require('../config/postgres');

const runMigrations = async () => {
  const client = await getClient();
  try {
    console.log('[Migration] Starting database migrations...');
    const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    await client.query('BEGIN');

    // Create schema_migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const executed = await client.query('SELECT filename FROM schema_migrations');
    const executedSet = new Set(executed.rows.map(r => r.filename));

    for (const file of files) {
      if (!executedSet.has(file)) {
        console.log(`[Migration] Executing: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        console.log(`[Migration] Applied successfully: ${file}`);
      } else {
        console.log(`[Migration] Already applied: ${file}`);
      }
    }

    await client.query('COMMIT');
    console.log('[Migration] All migrations completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migration] Migration failed, transaction rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigrations };
