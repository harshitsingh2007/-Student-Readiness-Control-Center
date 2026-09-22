/**
 * Idempotency & Concurrency Stress Tests
 * 
 * WHAT: Tests parallel and repeated idempotent submissions, SHA-256 fingerprint verification,
 *       and concurrent race condition serialization.
 * WHY: Section 10 & 25 requirement:
 *      3 concurrent identical requests -> exactly 1 attempt created, 1 logical success event.
 *      Same key + different body -> 422 rejected.
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../../src/app');
const { pool, query } = require('../../src/config/postgres');
const { closeMongo } = require('../../src/config/mongodb');

describe('Idempotency & Concurrent Submissions', () => {
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

  test('3 concurrent identical requests produce exactly ONE attempt in PostgreSQL', async () => {
    const idempotencyKey = `conc-key-${uuidv4()}`;
    const studentId = 'student-alpha-3';
    const payload = {
      competencyKey: 'frontend',
      score: 88,
      notes: 'Concurrent test submission',
    };

    // Count attempts before
    const beforeCountRes = await query(
      `SELECT COUNT(*)::int as count FROM attempts WHERE student_id = $1 AND notes = $2;`,
      [studentId, payload.notes]
    );
    const beforeCount = beforeCountRes.rows[0].count;

    // Send 3 requests concurrently
    const promises = [
      request(app)
        .post(`/api/students/${studentId}/attempts`)
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload),
      request(app)
        .post(`/api/students/${studentId}/attempts`)
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload),
      request(app)
        .post(`/api/students/${studentId}/attempts`)
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload),
    ];

    const responses = await Promise.all(promises);

    // All 3 requests must succeed: 1 Created and the others Replayed with stored response!
    const successResponses = responses.filter(r => r.status === 201 || r.status === 200);
    expect(successResponses.length).toBe(3);

    // Count attempts after
    const afterCountRes = await query(
      `SELECT COUNT(*)::int as count FROM attempts WHERE student_id = $1 AND notes = $2;`,
      [studentId, payload.notes]
    );
    const afterCount = afterCountRes.rows[0].count;

    // Exactly 1 new attempt inserted!
    expect(afterCount - beforeCount).toBe(1);

    const successRes = successResponses.find(r => r.body.attempt?.id);
    const createdAttemptId = successRes ? successRes.body.attempt.id : null;
    expect(createdAttemptId).not.toBeNull();

    // Verify exactly 1 outbox event exists for this created attemptId
    const outboxRes = await query(
      `SELECT COUNT(*)::int as count 
       FROM outbox_events 
       WHERE payload->>'studentId' = $1 AND (payload->>'attemptId')::text = $2;`,
      [studentId, String(createdAttemptId)]
    );
    expect(outboxRes.rows[0].count).toBe(1);
  });

  test('replaying request with same key returns stored response with replay header', async () => {
    const idempotencyKey = `replay-key-${uuidv4()}`;
    const studentId = 'student-alpha-4';
    const payload = {
      competencyKey: 'databases',
      score: 75,
      notes: 'Initial attempt for replay test',
    };

    // 1. First submission
    const res1 = await request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(201);
    const originalAttemptId = res1.body.attempt.id;

    // 2. Second submission with exact same key & body
    const res2 = await request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res2.status).toBe(201);
    expect(res2.headers['x-idempotency-replay']).toBe('true');
    expect(res2.body.attempt.id).toBe(originalAttemptId);
  });

  test('reusing same key with different body is rejected with 422', async () => {
    const idempotencyKey = `mismatch-key-${uuidv4()}`;
    const studentId = 'student-alpha-4';

    // 1. First submission
    const res1 = await request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        competencyKey: 'frontend',
        score: 70,
        notes: 'Original body',
      });
    expect(res1.status).toBe(201);

    // 2. Reused key with modified score
    const res2 = await request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        competencyKey: 'frontend',
        score: 99, // DIFFERENT SCORE!
        notes: 'Original body',
      });

    expect(res2.status).toBe(422);
    expect(res2.body.code).toBe('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY');
  });
});
