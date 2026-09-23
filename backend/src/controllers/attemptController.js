/**
 * Attempt Controller (Idempotency Enforcement & Attempt Creation)
 * 
 * WHAT: Manages assessment attempt submission, Idempotency-Key header extraction,
 *       and delegation to attemptService.
 * WHY: Section 8 & 10 requirement:
 *      POST /api/students/:id/attempts requires Idempotency-Key, authentication,
 *      authorization, validation, atomic relational update, readiness recalculation,
 *      and safe event publishing.
 * WHAT PROBLEM IT PREVENTS: Prevents duplicate submissions and unauthenticated attempts.
 */

const { submitAttempt } = require('../services/attemptService');
const { recordRejectedEvent } = require('../services/eventPublisher');

/**
 * POST /api/students/:id/attempts
 */
const createAttempt = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    const errorMsg = 'Header Idempotency-Key is required for assessment submissions.';
    // Log rejection event to MongoDB for observability
    recordRejectedEvent({
      tenantId: req.tenantId,
      studentId: req.params.id,
      requestId: req.requestId,
      reason: 'MISSING_IDEMPOTENCY_KEY',
      metadata: {
        validationFailure: true,
      },
    });

    return res.status(400).json({
      code: 'MISSING_IDEMPOTENCY_KEY',
      message: errorMsg,
      requestId: req.requestId,
      fieldErrors: { 'headers.idempotency-key': 'Required header missing.' },
    });
  }

  try {
    const result = await submitAttempt({
      tenantId: req.tenantId,
      studentId: req.params.id,
      evaluatorId: req.user.userId,
      idempotencyKey: idempotencyKey.trim(),
      attemptData: req.validatedAttempt,
      requestId: req.requestId,
    });

    if (result.isReplay) {
      res.setHeader('X-Idempotency-Replay', 'true');
    }

    return res.status(result.statusCode).json({
      ...result.data,
      requestId: req.requestId,
    });
  } catch (err) {
    // Record rejection event for failures
    recordRejectedEvent({
      tenantId: req.tenantId,
      studentId: req.params.id,
      requestId: req.requestId,
      reason: err.code || 'ATTEMPT_CREATION_FAILED',
      metadata: {
        error: err.message,
        idempotencyKey: idempotencyKey ? idempotencyKey.trim() : null,
        validationFailure: err.statusCode === 400 || err.statusCode === 422,
      },
    });
    next(err);
  }
};

module.exports = {
  createAttempt,
};
