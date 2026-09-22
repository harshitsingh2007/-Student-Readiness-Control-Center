/**
 * Database Seed Utility
 * 
 * WHAT: Populates the PostgreSQL database with realistic multi-tenant test data.
 * WHY: Provides initial tenants (Alpha, Beta), roles (ADMIN, EVALUATOR), active competencies,
 *      and student records demonstrating every readiness state (READY, NEARLY_READY, DEVELOPING,
 *      NEEDS_PREPARATION, INCOMPLETE, and timestamp tie-breaking).
 * WHAT PROBLEM IT PREVENTS: Prevents starting with an empty database or having to manually
 *      craft multi-tenant records during testing or live defense.
 */

const fs = require('fs');
const path = require('path');
const { pool, getClient } = require('../config/postgres');

const runSeed = async () => {
  const client = await getClient();
  try {
    console.log('[Seed] Seeding database with initial data...');
    const seedFile = path.resolve(__dirname, '../../../database/seed/seed_data.sql');
    const sql = fs.readFileSync(seedFile, 'utf8');

    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    console.log('[Seed] Database seeded successfully.');

    // Print summary of seeded data
    const tenants = await client.query('SELECT id, name FROM tenants');
    const students = await client.query('SELECT tenant_id, current_readiness, COUNT(*) FROM students GROUP BY tenant_id, current_readiness ORDER BY tenant_id, current_readiness');
    const competencies = await client.query('SELECT key, weight FROM competencies WHERE active = TRUE');

    console.log('\n--- Seed Summary ---');
    console.log('Tenants:', tenants.rows.map(t => `${t.name} (${t.id})`).join(', '));
    console.log('Active Competencies:', competencies.rows.map(c => `${c.key}: ${c.weight * 100}%`).join(', '));
    console.log('Students distribution:');
    students.rows.forEach(r => {
      console.log(`  - [${r.tenant_id}] ${r.current_readiness}: ${r.count}`);
    });
    console.log('--------------------\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed] Seeding failed, transaction rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runSeed };
