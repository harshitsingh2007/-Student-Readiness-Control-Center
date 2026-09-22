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

  // 1. Check if record already exists with row-level lock
  const existingRes = await client.query(
    `SELECT tenant_id, key, request_fingerprint, status, response_status_code, response_body, expires_at 
     FROM idempotency_records 
     WHERE tenant_id = $1 AND key = $2 
     FOR UPDATE;`,
    [tenantId, key]
  );

  if (existingRes.rows.length > 0) {
    const record = existingRes.rows[0];

    // Check if expired
    if (new Date(record.expires_at) < now) {
      // Re-initialize expired record
      await client.query(
        `UPDATE idempotency_records 
         SET request_fingerprint = $1, status = 'IN_PROGRESS', response_status_code = NULL, response_body = NULL, created_at = NOW(), expires_at = $2 
         WHERE tenant_id = $3 AND key = $4;`,
        [fingerprint, expiresAt, tenantId, key]
      );
      return { action: 'ACQUIRED' };
    }

    // Check fingerprint match
    if (record.request_fingerprint !== fingerprint) {
      return {
        action: 'MISMATCH',
        message: 'Idempotency key has already been used with a different request payload.',
      };
    }

    // Check completion status
    if (record.status === 'COMPLETED') {
      return {
        action: 'REPLAY',
        statusCode: record.response_status_code || 200,
        responseBody: record.response_body,
      };
    }

    if (record.status === 'IN_PROGRESS') {
      return {
        action: 'CONCURRENT',
        message: 'A concurrent request with this idempotency key is currently being processed.',
      };
    }
  }

  // 2. Not found: Insert new IN_PROGRESS record
  await client.query(
    `INSERT INTO idempotency_records (tenant_id, key, request_fingerprint, status, expires_at) 
     VALUES ($1, $2, $3, 'IN_PROGRESS', $4);`,
    [tenantId, key, fingerprint, expiresAt]
  );

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
    await client.query(
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
