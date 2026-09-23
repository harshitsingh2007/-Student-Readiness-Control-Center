/**
 * MongoDB Operational Event Store Configuration & Client
 * 
 * WHAT: Manages connection to MongoDB and sets up operational collections & indexes.
 * WHY: MongoDB is exclusively used as an append-only operational activity event store
 *      (e.g., attempt.succeeded, attempt.rejected).
 * WHAT PROBLEM IT PREVENTS: Prevents confusing relational data with operational events.
 *      PostgreSQL remains the source of truth, while MongoDB handles fast append-only
 *      audit logs and operational analytics.
 */

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student_readiness_operational';

let client = null;
let db = null;

const connectMongo = async () => {
  if (db) return db;
  try {
    client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 5000,
    });
    await client.connect();
    db = client.db();
    console.log('[MongoDB] Connected to operational event database successfully');

    // Ensure indexes on activity_events collection for efficient querying and deduplication
    const collection = db.collection('activity_events');
    await collection.createIndex({ eventId: 1 }, { unique: true });
    await collection.createIndex({ tenantId: 1, occurredAt: -1 });
    await collection.createIndex({ eventType: 1, occurredAt: -1 });
    await collection.createIndex({ tenantId: 1, eventType: 1, occurredAt: -1 });
    await collection.createIndex({ attemptId: 1 });

    return db;
  } catch (err) {
    console.error('[MongoDB] Connection warning (operational events will be queued via outbox):', err.message);
    return null;
  }
};

const getMongoDb = () => db;

const getActivityCollection = () => {
  if (!db) return null;
  return db.collection('activity_events');
};

const closeMongo = async () => {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
};

module.exports = {
  connectMongo,
  getMongoDb,
  getActivityCollection,
  closeMongo,
};
