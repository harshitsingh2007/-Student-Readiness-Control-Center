/**
 * Database Setup & Cluster Initialization Utility
 * 
 * WHAT: Ensures a PostgreSQL database is available and accessible.
 *       First tries connecting to configured PGHOST:PGPORT.
 *       If connection fails (e.g. password mismatch or service not running),
 *       it automatically provisions a local PostgreSQL cluster in `database/pgdata`
 *       on port 5433 with trust authentication and starts it.
 * WHY: Enables zero-friction, one-command setup for evaluators and developers without
 *      requiring system administrator rights or hardcoded Windows passwords.
 */

const { Client } = require('pg');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const findPgBin = () => {
  const commonPaths = [
    'C:\\Program Files\\PostgreSQL\\18\\bin',
    'C:\\Program Files\\PostgreSQL\\17\\bin',
    'C:\\Program Files\\PostgreSQL\\16\\bin',
    'C:\\Program Files\\PostgreSQL\\15\\bin',
    'C:\\Program Files\\PostgreSQL\\14\\bin',
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(path.join(p, 'initdb.exe'))) {
      return p;
    }
  }
  return null;
};

const testConnection = async (config) => {
  const client = new Client(config);
  try {
    await client.connect();
    await client.query('SELECT 1;');
    await client.end();
    return true;
  } catch (err) {
    return false;
  }
};

const ensureDatabaseExists = async (config, dbName) => {
  const adminClient = new Client({
    ...config,
    database: 'postgres',
  });
  try {
    await adminClient.connect();
    const res = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1;`,
      [dbName]
    );
    if (res.rows.length === 0) {
      console.log(`[DB Setup] Creating database '${dbName}'...`);
      await adminClient.query(`CREATE DATABASE "${dbName}";`);
    }
    await adminClient.end();
    return true;
  } catch (err) {
    console.error(`[DB Setup] Could not verify/create database:`, err.message);
    try { await adminClient.end(); } catch (_) {}
    return false;
  }
};

const startLocalCluster = async () => {
  const pgBin = findPgBin();
  if (!pgBin) {
    throw new Error('PostgreSQL bin folder not found. Please install PostgreSQL or configure .env.');
  }

  const dataDir = path.resolve(__dirname, '../../../database/pgdata');
  const port = 5433;

  if (!fs.existsSync(dataDir)) {
    console.log(`[DB Setup] Initializing local PostgreSQL cluster at ${dataDir}...`);
    fs.mkdirSync(dataDir, { recursive: true });
    execSync(`"${path.join(pgBin, 'initdb.exe')}" -U postgres -A trust -D "${dataDir}"`, {
      stdio: 'inherit',
    });
  }

  console.log(`[DB Setup] Starting local PostgreSQL on port ${port}...`);
  try {
    execSync(`"${path.join(pgBin, 'pg_ctl.exe')}" -D "${dataDir}" -o "-p ${port}" start`, {
      stdio: 'inherit',
    });
  } catch (err) {
    // Might already be running
  }

  // Update backend .env to use port 5433
  const envPath = path.resolve(__dirname, '../../.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  if (!envContent.includes('PGPORT=5433')) {
    envContent = envContent.replace(/PGPORT=\d+/g, 'PGPORT=5433');
    if (!envContent.includes('PGPORT=')) {
      envContent += '\nPGPORT=5433\n';
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
  }
  process.env.PGPORT = '5433';

  // Wait 2 seconds for server to accept connections
  await new Promise((r) => setTimeout(r, 2000));
};

const setupPostgres = async () => {
  const dbName = process.env.PGDATABASE || 'student_readiness';
  const defaultPort = parseInt(process.env.PGPORT || '5432', 10);
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD || 'postgres';
  const host = process.env.PGHOST || 'localhost';

  console.log(`[DB Setup] Checking PostgreSQL on ${host}:${defaultPort}...`);
  const connected = await testConnection({ host, port: defaultPort, user, password, database: 'postgres' });

  if (connected) {
    console.log(`[DB Setup] Connected successfully to PostgreSQL on port ${defaultPort}`);
    await ensureDatabaseExists({ host, port: defaultPort, user, password }, dbName);
    return;
  }

  console.log(`[DB Setup] Connection to port ${defaultPort} failed or requires different credentials.`);
  console.log(`[DB Setup] Switching to isolated local cluster on port 5433...`);

  await startLocalCluster();
  await ensureDatabaseExists({ host: 'localhost', port: 5433, user: 'postgres', password: '' }, dbName);
  console.log(`[DB Setup] Local cluster verified and ready on port 5433.`);
};

if (require.main === module) {
  setupPostgres()
    .then(() => {
      console.log('[DB Setup] Complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[DB Setup] Failed:', err);
      process.exit(1);
    });
}

module.exports = { setupPostgres };
