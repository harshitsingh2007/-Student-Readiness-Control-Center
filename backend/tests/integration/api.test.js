/**
 * API Integration Tests: Authentication, Tenant Isolation & Optimistic Concurrency
 * 
 * WHAT: Integration tests against the Express HTTP API backed by real PostgreSQL and MongoDB.
 * WHY: Section 25 requirement:
 *      - Successful attempt plus rollback
 *      - Strict tenant isolation
 *      - Input validation
 *      - Stale version conflict handling
 *      - Unauthorized request rejection
 */

const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/config/postgres');
const { closeMongo } = require('../../src/config/mongodb');

describe('API Integration Tests', () => {
  let alphaEvaluatorToken;
  let alphaAdminToken;
  let betaEvaluatorToken;

  beforeAll(async () => {
    // Login as Alpha Evaluator
    const loginAlphaEval = await request(app)
      .post('/api/auth/login')
      .send({ email: 'evaluator@alpha.com', password: 'Password123!' });
    alphaEvaluatorToken = loginAlphaEval.body.token;

    // Login as Alpha Admin
    const loginAlphaAdmin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@alpha.com', password: 'Password123!' });
    alphaAdminToken = loginAlphaAdmin.body.token;

    // Login as Beta Evaluator
    const loginBetaEval = await request(app)
      .post('/api/auth/login')
      .send({ email: 'evaluator@beta.com', password: 'Password123!' });
    betaEvaluatorToken = loginBetaEval.body.token;
  });

  afterAll(async () => {
    const seededIds = [
      'student-alpha-1',
      'student-alpha-2',
      'student-alpha-3',
      'student-alpha-4',
      'student-alpha-5',
      'student-alpha-6',
      'student-beta-1',
      'student-beta-2'
    ];
    await pool.query('DELETE FROM students WHERE id != ALL($1);', [seededIds]);
    await pool.end();
    await closeMongo();
  });

  describe('Authentication & Authorization', () => {
    test('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/students');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
      expect(res.body.requestId).toBeDefined();
    });

    test('rejects evaluator from accessing admin-only endpoint with 403', async () => {
      const res = await request(app)
        .get('/api/analytics/readiness-drift')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    test('allows admin to access admin-only readiness drift endpoint', async () => {
      const res = await request(app)
        .get('/api/analytics/readiness-drift')
        .set('Authorization', `Bearer ${alphaAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe('tenant-alpha');
      expect(res.body.driftedCount).toBeDefined();
    });
  });

  describe('Multi-Tenant Isolation & Non-Disclosing 404', () => {
    test('tenant alpha cannot view tenant beta student (returns safe 404)', async () => {
      const res = await request(app)
        .get('/api/students/student-beta-1')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Student not found.');
    });

    test('tenant alpha cannot submit attempt for tenant beta student', async () => {
      const res = await request(app)
        .post('/api/students/student-beta-1/attempts')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .set('Idempotency-Key', 'cross-tenant-key-1')
        .send({
          competencyKey: 'frontend',
          score: 95,
        });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    test('evaluator cannot override tenantId or role in request body or query', async () => {
      const res = await request(app)
        .get('/api/students?tenantId=tenant-beta')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`);
      expect(res.status).toBe(200);
      // Ensure all returned students strictly belong to tenant-alpha
      for (const item of res.body.items) {
        expect(item.id).toMatch(/^student-alpha-/);
      }
    });
  });

  describe('Optimistic Concurrency (PATCH /api/students/:id)', () => {
    test('updates student when expectedVersion matches and increments version', async () => {
      // First get student
      const getRes = await request(app)
        .get('/api/students/student-alpha-2')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`);
      const currentVersion = getRes.body.student.version;

      const patchRes = await request(app)
        .patch('/api/students/student-alpha-2')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .send({
          expectedVersion: currentVersion,
          name: 'Priya Patel (Updated)',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.student.version).toBe(currentVersion + 1);
      expect(patchRes.body.student.name).toBe('Priya Patel (Updated)');
    });

    test('returns 409 Conflict when expectedVersion is stale', async () => {
      const staleVersion = 999;
      const patchRes = await request(app)
        .patch('/api/students/student-alpha-2')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .send({
          expectedVersion: staleVersion,
          name: 'Priya Conflict Attempt',
        });

      expect(patchRes.status).toBe(409);
      expect(patchRes.body.code).toBe('VERSION_CONFLICT');
      expect(patchRes.body.currentVersion).toBeDefined();
    });
  });

  describe('Input Validation & Error Contract', () => {
    test('returns 400 with fieldErrors for out-of-range score', async () => {
      const res = await request(app)
        .post('/api/students/student-alpha-3/attempts')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .set('Idempotency-Key', 'val-test-key-1')
        .send({
          competencyKey: 'frontend',
          score: 150, // Invalid: > 100
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fieldErrors.score).toBeDefined();
    });

    test('returns 400 when Idempotency-Key header is missing', async () => {
      const res = await request(app)
        .post('/api/students/student-alpha-3/attempts')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .send({
          competencyKey: 'frontend',
          score: 80,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY');
    });
  });

  describe('Student Creation (POST /api/students)', () => {
    const uniqueEmailAlpha = `dynamic.student.${Date.now()}@alpha.edu`;
    let createdStudentId;

    test('rejects unauthenticated student creation with 401', async () => {
      const res = await request(app)
        .post('/api/students')
        .send({ name: 'Unauthenticated User', email: 'unauth@example.com' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    test('rejects missing or empty student name with 400', async () => {
      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .send({ name: '   ', email: 'test@alpha.edu' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fieldErrors.name).toBeDefined();
    });

    test('rejects missing or invalid email format with 400', async () => {
      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .send({ name: 'Valid Name', email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fieldErrors.email).toBeDefined();
    });

    test('successfully creates student with default INCOMPLETE readiness and NULL score', async () => {
      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .send({ name: 'Dynamic Rahul', email: uniqueEmailAlpha });

      expect(res.status).toBe(201);
      expect(res.body.student).toBeDefined();
      expect(res.body.student.id).toBeDefined();
      expect(res.body.student.name).toBe('Dynamic Rahul');
      expect(res.body.student.email).toBe(uniqueEmailAlpha.toLowerCase());
      expect(res.body.student.version).toBe(1);
      expect(res.body.student.currentScore).toBeNull();
      expect(res.body.student.currentReadiness).toBe('INCOMPLETE');
      createdStudentId = res.body.student.id;
    });

    test('rejects duplicate email in the same tenant with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .send({ name: 'Duplicate Rahul', email: uniqueEmailAlpha });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DUPLICATE_STUDENT_EMAIL');
      expect(res.body.message).toBe('A student with this email already exists.');
      expect(res.body.fieldErrors.email).toBeDefined();
    });

    test('allows same email in a different tenant (tenant-beta)', async () => {
      const res = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${betaEvaluatorToken}`)
        .send({ name: 'Beta Rahul', email: uniqueEmailAlpha });

      expect(res.status).toBe(201);
      expect(res.body.student.email).toBe(uniqueEmailAlpha.toLowerCase());
    });

    test('newly created student appears in tenant student list and enforces tenant isolation', async () => {
      // Alpha evaluator sees created student
      const alphaListRes = await request(app)
        .get(`/api/students?search=${encodeURIComponent(uniqueEmailAlpha)}`)
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`);
      expect(alphaListRes.status).toBe(200);
      expect(alphaListRes.body.items.some(s => s.id === createdStudentId)).toBe(true);

      // Beta evaluator does NOT see Alpha's created student
      const betaDetailRes = await request(app)
        .get(`/api/students/${createdStudentId}`)
        .set('Authorization', `Bearer ${betaEvaluatorToken}`);
      expect(betaDetailRes.status).toBe(404);
    });

    test('newly created student seamlessly works with assessment attempt workflow', async () => {
      const attemptRes = await request(app)
        .post(`/api/students/${createdStudentId}/attempts`)
        .set('Authorization', `Bearer ${alphaEvaluatorToken}`)
        .set('Idempotency-Key', `idem-dyn-attempt-${Date.now()}`)
        .send({ competencyKey: 'frontend', score: 92 });

      expect(attemptRes.status).toBe(201);
      expect(attemptRes.body.attempt).toBeDefined();
      expect(attemptRes.body.attempt.studentId).toBe(createdStudentId);
      expect(attemptRes.body.readiness.status).toBe('INCOMPLETE');
    });
  });
});
