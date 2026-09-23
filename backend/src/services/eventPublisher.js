/**
 * Transactional Outbox & Operational Event Publisher
 * 
 * WHAT: Publishes append-only events (attempt.succeeded, attempt.rejected) to MongoDB
 *       via a resilient PostgreSQL transactional outbox.
 * WHY: Section 7 & 8 requirement:
 *      - Dual-store resilience: PostgreSQL commits first, MongoDB event write is retry-safe.
 *      - Solves the distributed transaction problem without 2PC.
 *      - Unique eventId in MongoDB prevents duplicate logical success events on retries.
 * WHAT PROBLEM IT PREVENTS: Prevents loss of operational audit events during MongoDB outages,
 *      and prevents false success events in MongoDB when PostgreSQL transactions roll back.
 */

const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/postgres');
const { getActivityCollection, connectMongo } = require('../config/mongodb');

/**
 * Record an operational event into the PostgreSQL outbox table.
 * MUST be executed inside the same SQL transaction as the business operation.
 */
const recordOutboxEvent = async (client, tenantId, eventType, payload) => {
  const eventId = `evt_${uuidv4()}`;
  const fullPayload = {
    eventId,
    tenantId,
    eventType,
    occurredAt: new Date().toISOString(),
    ...payload,
  };

  await client.query(
    `INSERT INTO outbox_events (tenant_id, event_id, event_type, payload, status) 
     VALUES ($1, $2, $3, $4, 'PENDING');`,
    [tenantId, eventId, eventType, JSON.stringify(fullPayload)]
  );

  return eventId;
};

/**
 * Flushes pending outbox events from PostgreSQL to MongoDB.
 * Retry-safe and idempotent due to MongoDB unique index on eventId.
 */
const flushPendingOutboxEvents = async () => {
  try {
    const mongoDb = await connectMongo();
    if (!mongoDb) {
      // MongoDB currently unavailable; events safely preserved in PostgreSQL outbox
      return { published: 0, pending: true, message: 'MongoDB unreachable, will retry' };
    }

    const collection = getActivityCollection();
    if (!collection) return { published: 0 };

    // Fetch batch of pending events from PostgreSQL
    const pending = await query(
      `SELECT id, tenant_id, event_id, event_type, payload, retry_count 
       FROM outbox_events 
       WHERE status = 'PENDING' 
       ORDER BY created_at ASC 
       LIMIT 50;`
    );

    if (pending.rows.length === 0) {
      return { published: 0 };
    }

    let publishedCount = 0;

    for (const row of pending.rows) {
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;

      try {
        // Upsert to MongoDB using eventId as deduplication key
        await collection.updateOne(
          { eventId: row.event_id },
          {
            $setOnInsert: {
              eventId: row.event_id,
              tenantId: row.tenant_id,
              studentId: payload.studentId || null,
              attemptId: payload.attemptId || null,
              idempotencyKey: payload.idempotencyKey || payload.metadata?.idempotencyKey || null,
              requestId: payload.requestId || 'unknown',
              eventType: row.event_type,
              occurredAt: new Date(payload.occurredAt || Date.now()),
              metadata: payload.metadata || {},
            },
          },
          { upsert: true }
        );

        // Mark as published in PostgreSQL
        await query(
          `UPDATE outbox_events 
           SET status = 'PUBLISHED', published_at = NOW(), last_error = NULL 
           WHERE id = $1;`,
          [row.id]
        );
        publishedCount++;
      } catch (insertErr) {
        console.error(`[OutboxPublisher] Failed publishing event ${row.event_id}:`, insertErr.message);
        await query(
          `UPDATE outbox_events 
           SET retry_count = retry_count + 1, last_error = $1 
           WHERE id = $2;`,
          [insertErr.message, row.id]
        );
      }
    }

    return { published: publishedCount };
  } catch (err) {
    console.error('[OutboxPublisher] General flush error:', err.message);
    return { published: 0, error: err.message };
  }
};

/**
 * Records a rejection event directly to MongoDB (e.g. invalid payload or unauthorized).
 */
const recordRejectedEvent = async ({ tenantId, studentId, requestId, reason, metadata = {} }) => {
  try {
    const mongoDb = await connectMongo();
    if (!mongoDb) return;
    const collection = getActivityCollection();
    if (!collection) return;

    await collection.insertOne({
      eventId: `rej_${uuidv4()}`,
      tenantId: tenantId || 'unauthenticated',
      studentId: studentId || null,
      attemptId: null,
      idempotencyKey: metadata.idempotencyKey || null,
      requestId: requestId || 'unknown',
      eventType: 'attempt.rejected',
      occurredAt: new Date(),
      reason: reason || 'UNKNOWN_REJECTION',
      metadata: {
        reason,
        ...metadata,
      },
    });
  } catch (err) {
    console.warn('[OutboxPublisher] Could not log rejection event to MongoDB:', err.message);
  }
};

module.exports = {
  recordOutboxEvent,
  flushPendingOutboxEvents,
  recordRejectedEvent,
};
