/**
 * Idempotency Service (SHA-256 Fingerprinting & Replay)
 * 
 * WHAT: Enforces atomic, exactly-once request execution per tenant and idempotency key.
 * WHY: Section 10 requirement:
 *      - Repeated or concurrent identical requests must produce ONE attempt and ONE logical success event.
 *      - Replays original stored outcome (HTTP status + body) on duplicate requests.
 *      - Reusing the same key with a different body payload must be rejected with 422/409.
 * WHAT PROBLEM IT PREVENTS: Network retries, mobile disconnects, or rapid double-clicking
 *      cannot insert duplicate attempts or generate duplicate operational activity events.
 */

const crypto = require('crypto');

/**
 * Generate a deterministic SHA-256 fingerprint from request payload.
 */
const computeRequestFingerprint = (payload) => {
  const normalized = {
    competencyKey: payload.competencyKey ? String(payload.competencyKey).trim().toLowerCase() : '',
    score: payload.score !== undefined ? Number(payload.score) : 0,
    notes: payload.notes ? String(payload.notes).trim() : null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
};

/**
 * Checks or acquires an idempotency lock within an active PostgreSQL transaction.
 * 
 * @param {Object} client - PostgreSQL transaction client
 * @param {string} tenantId - Authenticated tenant ID
 * @param {string} key - Client-supplied Idempotency-Key
 * @param {string} fingerprint - SHA-256 hash of payload
 * @param {number} ttlHours - Expiry lifetime in hours (default: 24)
 * @returns {Object} Result object with action: 'ACQUIRED' | 'REPLAY' | 'MISMATCH' | 'CONCURRENT'
 */
const checkOrAcquireIdempotency = async (client, tenantId, key, fingerprint, ttlHours = 24) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  // Redesigned atomic concurrency-safe idempotency acquisition:
  // Uses INSERT ... ON CONFLICT (tenant_id, key) DO UPDATE
  // This avoids race conditions on non-existent rows that SELECT FOR UPDATE cannot lock.
  // If concurrent transactions arrive with the same key, PostgreSQL puts subsequent
  // transactions into row-lock wait until the first transaction COMMITS or ROLLS BACK.
  const result = await client.query(
    `INSERT INTO idempotency_records (tenant_id, key, request_fingerprint, status, expires_at)
     VALUES ($1, $2, $3, 'IN_PROGRESS', $4)
     ON CONFLICT (tenant_id, key) DO UPDATE 
     SET key = EXCLUDED.key
     RETURNING status, request_fingerprint, response_status_code, response_body, expires_at, (xmax = 0) AS is_new;`,
    [tenantId, key, fingerprint, expiresAt]
  );

  const record = result.rows[0];

  // 1. Newly inserted: primary transaction acquired the lock
  if (record.is_new) {
    return { action: 'ACQUIRED' };
  }

  // 2. Check if existing record has expired
  if (new Date(record.expires_at) < now) {
    await client.query(
      `UPDATE idempotency_records 
       SET request_fingerprint = $1, status = 'IN_PROGRESS', response_status_code = NULL, response_body = NULL, created_at = NOW(), expires_at = $2 
       WHERE tenant_id = $3 AND key = $4;`,
      [fingerprint, expiresAt, tenantId, key]
    );
    return { action: 'ACQUIRED' };
  }

  // 3. Same key + different fingerprint => 422 Unprocessable Entity
  if (record.request_fingerprint !== fingerprint) {
    return {
      action: 'MISMATCH',
      message: 'Idempotency key has already been used with a different request payload.',
    };
  }

  // 4. Same key + same fingerprint: return/replay original result
  if (record.status === 'COMPLETED') {
    return {
      action: 'REPLAY',
      statusCode: record.response_status_code || 200,
      responseBody: record.response_body,
    };
  }

  // 5. In-progress fallback (if transaction still active or interrupted)
  if (record.status === 'IN_PROGRESS') {
    return {
      action: 'CONCURRENT',
      message: 'A concurrent request with this idempotency key is currently being processed.',
    };
  }

  return { action: 'ACQUIRED' };
};

/**
 * Save final response in idempotency record on successful transaction commit.
 */
const completeIdempotency = async (client, tenantId, key, statusCode, responseBody) => {
  await client.query(
    `UPDATE idempotency_records 
     SET status = 'COMPLETED', response_status_code = $1, response_body = $2 
     WHERE tenant_id = $3 AND key = $4;`,
    [statusCode, JSON.stringify(responseBody), tenantId, key]
  );
};

/**
 * Clear or mark failed idempotency lock on transaction rollback.
 */
const releaseIdempotencyOnFailure = async (client, tenantId, key) => {
  try {
    const { pool } = require('../config/postgres');
    await pool.query(
      `DELETE FROM idempotency_records WHERE tenant_id = $1 AND key = $2 AND status = 'IN_PROGRESS';`,
      [tenantId, key]
    );
  } catch (err) {
    console.error('[Idempotency] Error releasing failed lock:', err.message);
  }
};

module.exports = {
  computeRequestFingerprint,
  checkOrAcquireIdempotency,
  completeIdempotency,
  releaseIdempotencyOnFailure,
};
