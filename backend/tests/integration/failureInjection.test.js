/**
 * Failure Injection Tests: MongoDB Outage & Outbox Resilience
 * 
 * WHAT: Simulates MongoDB being completely offline/unreachable while an attempt is submitted.
 * WHY: Section 26 requirement:
 *      - PostgreSQL transaction commits successfully even if MongoDB write fails.
 *      - Relational state is never rolled back due to operational event storage failures.
 *      - Event remains pending in outbox_events with retryability.
 *      - Once MongoDB recovers, outbox publisher flushes the pending event.
 *      - Deduplication via unique eventId guarantees zero duplicate logical success events.
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../../src/app');
const { pool, query } = require('../../src/config/postgres');
const { flushPendingOutboxEvents } = require('../../src/services/eventPublisher');
const { getActivityCollection, connectMongo, closeMongo } = require('../../src/config/mongodb');
const mongodbConfig = require('../../src/config/mongodb');

describe('Failure Injection: MongoDB Outage & Outbox Resilience', () => {
  let evaluatorToken;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'evaluator@alpha.com', password: 'Password123!' });
    evaluatorToken = loginRes.body.token;
  });

  afterAll(async () => {
    await pool.end();
    await closeMongo();
  });

  test('relational transaction succeeds during simulated MongoDB outage and outbox safely flushes on recovery', async () => {
    const studentId = 'student-alpha-6';
    const idempotencyKey = `fail-inj-${uuidv4()}`;

    // 1. Simulate MongoDB outage by monkeypatching getActivityCollection to simulate error / null
    const originalGetActivityCollection = mongodbConfig.getActivityCollection;
    const originalConnectMongo = mongodbConfig.connectMongo;

    // Simulate MongoDB outage
    mongodbConfig.connectMongo = async () => null;
    mongodbConfig.getActivityCollection = () => null;

    // 2. Submit assessment attempt while MongoDB is down
    const submitRes = await request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        competencyKey: 'backend',
        score: 94,
        notes: 'Simulated Mongo outage test attempt',
      });

    // Verification 1: PostgreSQL relational write SUCCEEDED and returned 201!
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.attempt).toBeDefined();
    expect(submitRes.body.attempt.score).toBe(94);
    const eventId = submitRes.body.eventId;
    expect(eventId).toBeDefined();

    // Verification 2: Check PostgreSQL outbox - event is stored with status 'PENDING'
    const outboxRes = await query(
      `SELECT event_id, status, retry_count FROM outbox_events WHERE event_id = $1;`,
      [eventId]
    );
    expect(outboxRes.rows.length).toBe(1);
    expect(outboxRes.rows[0].status).toBe('PENDING');

    // 3. Restore MongoDB connectivity
    mongodbConfig.connectMongo = originalConnectMongo;
    mongodbConfig.getActivityCollection = originalGetActivityCollection;

    await connectMongo();
    const collection = getActivityCollection();

    // Verification 3: Flush outbox now that MongoDB is restored
    await flushPendingOutboxEvents();

    // Verification 4: Outbox in PostgreSQL is now marked 'PUBLISHED'
    const outboxUpdatedRes = await query(
      `SELECT status, published_at FROM outbox_events WHERE event_id = $1;`,
      [eventId]
    );
    expect(outboxUpdatedRes.rows[0].status).toBe('PUBLISHED');
    expect(outboxUpdatedRes.rows[0].published_at).not.toBeNull();

    // Verification 5: MongoDB contains exactly ONE document for this eventId
    const mongoDocCount = await collection.countDocuments({ eventId });
    expect(mongoDocCount).toBe(1);

    // Verification 6: Calling flush again does NOT create duplicate events in MongoDB
    await flushPendingOutboxEvents();
    const docCountAfterSecondFlush = await collection.countDocuments({ eventId });
    expect(docCountAfterSecondFlush).toBe(1);
  });
});
