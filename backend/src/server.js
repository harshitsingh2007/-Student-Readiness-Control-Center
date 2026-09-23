/**
 * Backend Server Entrypoint
 * 
 * WHAT: Boots the Express server on port 5002, establishes database connections,
 *       and starts the background outbox event publishing worker.
 * WHY: Section 2 & 7 requirement:
 *      Backend on port 5002, MongoDB connection, reliable outbox event processing.
 */

const dotenv = require('dotenv');
dotenv.config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length === 0) {
  console.error('[Server] FATAL: JWT_SECRET environment variable is required.');
  process.exit(1);
}

const app = require('./app');
const { connectMongo, closeMongo } = require('./config/mongodb');
const { pool } = require('./config/postgres');
const { flushPendingOutboxEvents } = require('./services/eventPublisher');

const PORT = parseInt(process.env.PORT || '5002', 10);

let outboxInterval = null;

const startServer = async () => {
  try {
    // 1. Connect to MongoDB (non-blocking if temporary outage)
    await connectMongo();

    // 2. Start background outbox publisher worker (runs every 5 seconds)
    outboxInterval = setInterval(async () => {
      try {
        await flushPendingOutboxEvents();
      } catch (err) {
        // Silent catch; logged inside flushPendingOutboxEvents
      }
    }, 5000);

    // 3. Start Express HTTP Server
    const server = app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`Student Readiness Control Center Backend Running`);
      console.log(`Port:        ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:5175'}`);
      console.log(`====================================================`);
    });

    // Graceful Shutdown
    const shutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
      if (outboxInterval) clearInterval(outboxInterval);
      server.close(async () => {
        try {
          await pool.end();
          await closeMongo();
          console.log('[Server] Connections closed. Exiting.');
          process.exit(0);
        } catch (err) {
          console.error('[Server] Error during shutdown:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    return server;
  } catch (err) {
    console.error('[Server] Fatal startup failure:', err);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
