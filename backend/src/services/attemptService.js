/**
 * Attempt Service (Transaction Boundary & Concurrency Control)
 * 
 * WHAT: Manages assessment attempt creation, row-level locking, readiness recalculation,
 *       and transactional outbox event queuing.
 * WHY: Section 10 & 14 requirement:
 *      Strategy Selected: Strategy A (Pessimistic Row-Locking with SELECT FOR UPDATE)
 *      - Rationale: Locking the student row during attempt insertion guarantees strict serialization
 *        of score calculations. Concurrent submissions for the same student wait in line rather
 *        than calculating scores based on stale partial snapshots.
 *      - Paired with idempotency locks, identical concurrent retries are replayed with zero duplicate side effects.
 * WHAT PROBLEM IT PREVENTS: Prevents race conditions where concurrent submissions overwrite each other's
 *      scores, and prevents duplicate attempts from mobile retries or double-clicking.
 */

const { performance } = require('perf_hooks');
const { getClient } = require('../config/postgres');
const { computeRequestFingerprint, checkOrAcquireIdempotency, completeIdempotency, releaseIdempotencyOnFailure } = require('./idempotencyService');
const { recalculateStudentReadiness } = require('./readinessService');
const { recordOutboxEvent, flushPendingOutboxEvents } = require('./eventPublisher');

/**
 * Creates an assessment attempt within a strict ACID transaction boundary.
 * 
 * @param {Object} params
 * @param {string} params.tenantId - Authenticated tenant ID
 * @param {string} params.studentId - Target student ID
 * @param {string} params.evaluatorId - Authenticated evaluator user ID
 * @param {string} params.idempotencyKey - Client-supplied Idempotency-Key header
 * @param {Object} params.attemptData - { competencyKey, score, notes }
 * @param {string} params.requestId - Request tracking ID
 */
const submitAttempt = async ({
  tenantId,
  studentId,
  evaluatorId,
  idempotencyKey,
  attemptData,
  requestId,
}) => {
  const startTime = performance.now();
  const client = await getClient();
  const fingerprint = computeRequestFingerprint(attemptData);

  try {
    await client.query('BEGIN');

    // 1. Check or acquire Idempotency Lock
    const idempResult = await checkOrAcquireIdempotency(client, tenantId, idempotencyKey, fingerprint);

    if (idempResult.action === 'REPLAY') {
      await client.query('COMMIT');
      return {
        isReplay: true,
        statusCode: idempResult.statusCode,
        data: idempResult.responseBody,
      };
    }

    if (idempResult.action === 'MISMATCH') {
      await client.query('ROLLBACK');
      const err = new Error(idempResult.message);
      err.statusCode = 422;
      err.code = 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY';
      throw err;
    }

    if (idempResult.action === 'CONCURRENT') {
      await client.query('ROLLBACK');
      const err = new Error(idempResult.message);
      err.statusCode = 409;
      err.code = 'CONCURRENT_REQUEST_IN_PROGRESS';
      throw err;
    }

    // 2. Lock student row to prevent concurrent race conditions on readiness calculation
    const studentRes = await client.query(
      `SELECT id, tenant_id, name, version 
       FROM students 
       WHERE id = $1 AND tenant_id = $2 
       FOR UPDATE;`,
      [studentId, tenantId]
    );

    if (studentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      const err = new Error('Student not found.');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    // 3. Resolve active competency
    const compRes = await client.query(
      `SELECT id, key, name, weight 
       FROM competencies 
       WHERE key = $1 AND active = TRUE;`,
      [attemptData.competencyKey]
    );

    if (compRes.rows.length === 0) {
      await client.query('ROLLBACK');
      const err = new Error(`Competency '${attemptData.competencyKey}' is invalid or inactive.`);
      err.statusCode = 400;
      err.code = 'INVALID_COMPETENCY';
      err.fieldErrors = { competencyKey: 'Selected competency does not exist or is inactive.' };
      throw err;
    }

    const competency = compRes.rows[0];

    // 4. Insert new attempt
    const attemptInsertRes = await client.query(
      `INSERT INTO attempts (tenant_id, student_id, competency_id, score, evaluator_id, submitted_at, notes) 
       VALUES ($1, $2, $3, $4, $5, NOW(), $6) 
       RETURNING id, tenant_id, student_id, competency_id, score, evaluator_id, submitted_at, notes, is_void;`,
      [tenantId, studentId, competency.id, attemptData.score, evaluatorId, attemptData.notes || null]
    );

    const newAttempt = attemptInsertRes.rows[0];

    // 5. Recalculate readiness inside the same transaction
    const updatedReadiness = await recalculateStudentReadiness(client, tenantId, studentId);

    // 6. Increment student version for optimistic concurrency tracking
    await client.query(
      `UPDATE students SET version = version + 1 WHERE id = $1 AND tenant_id = $2;`,
      [studentId, tenantId]
    );

    const latencyMs = Math.max(1, Math.round(performance.now() - startTime));

    // 7. Insert operational event into outbox
    const eventId = await recordOutboxEvent(client, tenantId, 'attempt.succeeded', {
      studentId,
      attemptId: newAttempt.id,
      idempotencyKey,
      requestId,
      metadata: {
        competencyKey: competency.key,
        score: newAttempt.score,
        evaluatorId,
        newReadiness: updatedReadiness.status,
        newOverallScore: updatedReadiness.score,
        latencyMs,
      },
    });

    const responsePayload = {
      attempt: {
        id: newAttempt.id,
        studentId: newAttempt.student_id,
        competencyKey: competency.key,
        competencyName: competency.name,
        score: Number(newAttempt.score),
        evaluatorId: newAttempt.evaluator_id,
        submittedAt: newAttempt.submitted_at,
        notes: newAttempt.notes,
      },
      readiness: updatedReadiness,
      eventId,
    };

    // 8. Save response in idempotency record
    await completeIdempotency(client, tenantId, idempotencyKey, 201, responsePayload);

    // 9. Commit relational transaction
    await client.query('COMMIT');

    // 10. Asynchronously flush outbox event to MongoDB (non-blocking, failure-safe)
    setImmediate(() => {
      flushPendingOutboxEvents().catch((flushErr) => {
        console.error('[AttemptService] Background outbox flush failed:', flushErr.message);
      });
    });

    return {
      isReplay: false,
      statusCode: 201,
      data: responsePayload,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    await releaseIdempotencyOnFailure(client, tenantId, idempotencyKey).catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  submitAttempt,
};
