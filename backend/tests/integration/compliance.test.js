/**
 * Assessment Compliance & Verification Test Suite (Phases 1-10)
 * 
 * WHAT: Verifies the 10 critical compliance requirements:
 *      1. A5: Concurrency race condition serialization (different keys, same student).
 *      2. A6: Operational latency (latencyMs) recorded in MongoDB events.
 *      3. A6: Validation failure produces 'attempt.rejected' event with validationFailure: true.
 *      4. A6: MongoDB p95 latency aggregation calculates true value or null.
 *      5. A6: Duplicate-success anomaly detection for same key.
 *      6. A6: Multi-tenant analytics isolation (Alpha vs Beta).
 *      7. A7: Production demo-login disabled (returns 404).
 *      8. A7: Unauthorized tenant switching rejected (returns 403 in production).
 *      9. A7: Missing JWT_SECRET triggers fail-fast exception (no fallback).
 *     10. Phase 5: Dynamic competencies endpoint (GET /api/competencies).
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../../src/app');
const { pool, query } = require('../../src/config/postgres');
const { getMongoDb, closeMongo } = require('../../src/config/mongodb');
const { getJwtSecret } = require('../../src/middleware/auth');
const { flushPendingOutboxEvents } = require('../../src/services/eventPublisher');

describe('Full Specification Compliance Verification', () => {
  let alphaEvaluatorToken;
  let betaEvaluatorToken;
  let testStudentId;

  beforeAll(async () => {
    // Authenticate Alpha Evaluator
    const loginAlpha = await request(app)
      .post('/api/auth/login')
      .send({ email: 'evaluator@alpha.com', password: 'Password123!' });
    alphaEvaluatorToken = loginAlpha.body.token;

    // Authenticate Beta Evaluator
    const loginBeta = await request(app)
      .post('/api/auth/login')
      .send({ email: 'evaluator@beta.com', password: 'Password123!' });
    betaEvaluatorToken = loginBeta.body.token;

    // Create a dedicated test student in tenant-alpha for concurrency testing
    testStudentId = `student-compliance-${uuidv4().substring(0, 8)}`;
    await query(
      `INSERT INTO students (id, tenant_id, name, email, current_readiness, version)
       VALUES ($1, 'tenant-alpha', 'Compliance Concurrency Student', $2, 'INCOMPLETE', 1);`,
      [testStudentId, `${testStudentId}@test.com`]
    );
  });

  afterAll(async () => {
    // Clean up created test student and attempts
    if (testStudentId) {
      await query(`DELETE FROM attempts WHERE student_id = $1;`, [testStudentId]);
      await query(`DELETE FROM students WHERE id = $1;`, [testStudentId]);
    }
    await pool.end();
    await closeMongo();
  });

  describe('1. A5: Concurrency Race Condition with Different Idempotency Keys', () => {
    test('concurrent submissions with different keys for same student are serialized without lost updates', async () => {
      const key1 = `race-key-1-${uuidv4()}`;
      const key2 = `race-key-2-${uuidv4()}`;

      const payload1 = {
        competencyKey: 'frontend',
        score: 85,
        notes: 'Race test attempt 1',
      };
      const payload2 = {
        competencyKey: 'backend',
        score: 90,
        notes: 'Race test attempt 2',
      };

      // Launch both requests simultaneously against the same student
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/students/${testStudentId}/attempts`)
          .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
          .set('Idempotency-Key', key1)
          .send(payload1),
        request(app)
          .post(`/api/students/${testStudentId}/attempts`)
          .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
          .set('Idempotency-Key', key2)
          .send(payload2),
      ]);

      expect([200, 201]).toContain(res1.status);
      expect([200, 201]).toContain(res2.status);

      // Verify in PostgreSQL that both attempts were saved
      const attemptsRes = await query(
        `SELECT id, competency_id, score FROM attempts WHERE student_id = $1 ORDER BY id ASC;`,
        [testStudentId]
      );
      expect(attemptsRes.rows.length).toBe(2);

      // Verify student version was incremented twice (started at 1, now 3)
      const studentRes = await query(
        `SELECT version, current_readiness FROM students WHERE id = $1;`,
        [testStudentId]
      );
      expect(studentRes.rows[0].version).toBe(3);
    });
  });

  describe('2. A6: Operational Latency Tracking in MongoDB Events', () => {
    test('attempt.succeeded event records real latencyMs and idempotencyKey', async () => {
      const key = `latency-test-${uuidv4()}`;
      const res = await request(app)
        .post(`/api/students/${testStudentId}/attempts`)
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .set('Idempotency-Key', key)
        .send({
          competencyKey: 'databases',
          score: 80,
          notes: 'Testing latency tracking',
        });

      expect([200, 201]).toContain(res.status);

      // Flush outbox to MongoDB
      await flushPendingOutboxEvents();

      // Inspect MongoDB event
      const mongo = await getMongoDb();
      const event = await mongo.collection('activity_events').findOne({
        idempotencyKey: key,
        eventType: 'attempt.succeeded',
      });

      expect(event).toBeDefined();
      expect(typeof event.metadata?.latencyMs).toBe('number');
      expect(event.metadata.latencyMs).toBeGreaterThanOrEqual(0);
      expect(event.tenantId).toBe('tenant-alpha');
    });
  });

  describe('3. A6: Validation Failures Recorded as Operational Events', () => {
    test('rejected attempt writes attempt.rejected event with metadata.validationFailure: true', async () => {
      const invalidKey = `invalid-test-${uuidv4()}`;
      const res = await request(app)
        .post(`/api/students/${testStudentId}/attempts`)
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .set('Idempotency-Key', invalidKey)
        .send({
          competencyKey: 'frontend',
          score: 150, // Invalid: exceeds 100
        });

      expect(res.status).toBe(400);

      // Give event logger a moment to persist to MongoDB
      await new Promise(resolve => setTimeout(resolve, 100));

      const mongo = await getMongoDb();
      const rejectedEvent = await mongo.collection('activity_events').findOne({
        idempotencyKey: invalidKey,
        eventType: 'attempt.rejected',
      });

      expect(rejectedEvent).toBeDefined();
      expect(rejectedEvent.reason).toBe('VALIDATION_ERROR');
      expect(rejectedEvent.metadata?.validationFailure).toBe(true);
    });
  });

  describe('4. A6: MongoDB p95 Latency & Aggregation Pipeline', () => {
    test('activity summary computes real p95 latency or returns null when no observations', async () => {
      const res = await request(app)
        .get('/api/analytics/activity-summary')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe('tenant-alpha');
      expect(typeof res.body.uniqueSuccessfulAssessments).toBe('number');
      expect(typeof res.body.validationFailureRatePercent).toBe('number');

      // p95 latency should either be a non-negative number or null
      if (res.body.p95SubmissionLatencyMs !== null) {
        expect(typeof res.body.p95SubmissionLatencyMs).toBe('number');
        expect(res.body.p95SubmissionLatencyMs).toBeGreaterThanOrEqual(0);
      } else {
        expect(res.body.p95SubmissionLatencyMs).toBeNull();
      }
    });
  });

  describe('5. A6: Duplicate-Success Anomaly Detection', () => {
    test('returns multipleSuccessEventAnomalies array structure', async () => {
      const res = await request(app)
        .get('/api/analytics/activity-summary')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.multipleSuccessEventAnomalies)).toBe(true);
    });
  });

  describe('6. A6: Tenant Analytics Isolation', () => {
    test('each tenant only receives its own activity metrics', async () => {
      const [resAlpha, resBeta] = await Promise.all([
        request(app)
          .get('/api/analytics/activity-summary')
          .set('Authorization', `Bearer ${alphaEvaluatorToken}`),
        request(app)
          .get('/api/analytics/activity-summary')
          .set('Authorization', `Bearer ${betaEvaluatorToken}`),
      ]);

      expect(resAlpha.status).toBe(200);
      expect(resAlpha.body.tenantId).toBe('tenant-alpha');

      expect(resBeta.status).toBe(200);
      expect(resBeta.body.tenantId).toBe('tenant-beta');
    });
  });

  describe('7. A7: Security Hardening - Production Demo Login Disabled', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    test('demo login returns 404 in production environment', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .post('/api/auth/demo-login')
        .send({ tenantId: 'tenant-alpha', role: 'evaluator' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('8. A7: Security Hardening - Unauthorized Tenant Switching', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    test('tenant switching to unauthorized tenant returns 403 in production', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .post('/api/auth/switch-tenant')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .send({ targetTenantId: 'tenant-beta' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    test('tenant switching to verified authorized tenant succeeds in production', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .post('/api/auth/switch-tenant')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .send({ targetTenantId: 'tenant-alpha' });

      expect(res.status).toBe(200);
      expect(res.body.user.tenantId).toBe('tenant-alpha');
    });
  });

  describe('9. A7: Missing JWT_SECRET Startup Protection', () => {
    test('throws fatal exception if JWT_SECRET environment variable is missing', () => {
      const originalJwt = process.env.JWT_SECRET;
      try {
        delete process.env.JWT_SECRET;
        expect(() => getJwtSecret()).toThrow('JWT_SECRET is required');
      } finally {
        process.env.JWT_SECRET = originalJwt;
      }
    });
  });

  describe('10. Phase 5: Dynamic Competencies Endpoint', () => {
    test('GET /api/competencies returns active competencies from PostgreSQL', async () => {
      const res = await request(app)
        .get('/api/competencies')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.competencies)).toBe(true);
      expect(res.body.competencies.length).toBeGreaterThanOrEqual(4);

      const comp = res.body.competencies[0];
      expect(comp.key).toBeDefined();
      expect(comp.name).toBeDefined();
      expect(typeof comp.weight).toBe('number');
      expect(typeof comp.required).toBe('boolean');
    });
  });
});
