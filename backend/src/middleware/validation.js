/**
 * Request Validation & Input Sanitization Middleware
 * 
 * WHAT: Validates payloads, bounds pagination, checks types, and filters allowlisted fields.
 * WHY: Protects against mass assignment, SQL injection, oversized strings, and invalid ranges.
 * WHAT PROBLEM IT PREVENTS: Prevents malicious input from compromising database integrity
 *      or exhausting server resources.
 */

const { recordRejectedEvent } = require('../services/eventPublisher');

/**
 * Filter object to only allow permitted keys (prevents Mass Assignment).
 */
const allowlistFields = (obj, allowedKeys = []) => {
  if (!obj || typeof obj !== 'object') return {};
  const filtered = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
      filtered[key] = obj[key];
    }
  }
  return filtered;
};

/**
 * Validate and sanitize pagination and sorting parameters.
 */
const validatePagination = (req, res, next) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '10', 10);

  req.pagination = {
    page: isNaN(page) || page < 1 ? 1 : page,
    limit: isNaN(limit) || limit < 1 ? 10 : Math.min(limit, 50), // Bounded to max 50
  };
  req.pagination.offset = (req.pagination.page - 1) * req.pagination.limit;

  // Validate sort field to prevent SQL injection in ORDER BY
  const allowedSorts = ['name', 'current_score', 'created_at', 'updated_at', 'current_readiness'];
  const sort = req.query.sort || 'name';
  req.sortField = allowedSorts.includes(sort) ? sort : 'name';

  const order = (req.query.order || 'ASC').toUpperCase();
  req.sortOrder = order === 'DESC' ? 'DESC' : 'ASC';

  next();
};

/**
 * Validates attempt creation payload.
 */
const validateAttemptPayload = async (req, res, next) => {
  const { competencyKey, score, notes } = req.body || {};
  const fieldErrors = {};

  if (!competencyKey || typeof competencyKey !== 'string') {
    fieldErrors.competencyKey = 'A valid competency key is required.';
  }

  const numericScore = Number(score);
  if (score === undefined || score === null || isNaN(numericScore) || numericScore < 0 || numericScore > 100) {
    fieldErrors.score = 'Score must be a number between 0 and 100.';
  }

  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string') {
      fieldErrors.notes = 'Notes must be text.';
    } else if (notes.length > 2000) {
      fieldErrors.notes = 'Notes cannot exceed 2000 characters.';
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    await recordRejectedEvent({
      tenantId: req.tenantId || req.user?.tenantId,
      studentId: req.params?.id || null,
      requestId: req.requestId,
      reason: 'VALIDATION_ERROR',
      metadata: {
        validationFailure: true,
        fieldErrors,
        idempotencyKey: req.headers ? req.headers['idempotency-key'] : null,
      },
    });

    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Assessment attempt payload failed validation.',
      requestId: req.requestId,
      fieldErrors,
    });
  }

  req.validatedAttempt = {
    competencyKey: competencyKey.trim().toLowerCase(),
    score: Math.round(numericScore * 100) / 100, // 2 decimal precision
    notes: notes ? notes.trim() : null,
  };

  next();
};

/**
 * Validates student update payload (PATCH).
 */
const validateStudentUpdatePayload = (req, res, next) => {
  const { expectedVersion, name, email } = req.body || {};
  const fieldErrors = {};

  if (expectedVersion === undefined || expectedVersion === null || !Number.isInteger(Number(expectedVersion)) || Number(expectedVersion) < 1) {
    fieldErrors.expectedVersion = 'expectedVersion is required and must be a positive integer.';
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      fieldErrors.name = 'Name cannot be empty.';
    } else if (name.length > 255) {
      fieldErrors.name = 'Name cannot exceed 255 characters.';
    }
  }

  if (email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof email !== 'string' || !emailRegex.test(email.trim())) {
      fieldErrors.email = 'A valid email address is required.';
    } else if (email.length > 255) {
      fieldErrors.email = 'Email cannot exceed 255 characters.';
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Student update payload failed validation.',
      requestId: req.requestId,
      fieldErrors,
    });
  }

  req.validatedStudentUpdate = {
    expectedVersion: Number(expectedVersion),
    updates: allowlistFields(req.body, ['name', 'email']),
  };

  next();
};

/**
 * Validates student creation payload (POST /api/students).
 * Strictly requires non-empty name and valid email.
 */
const validateStudentCreatePayload = (req, res, next) => {
  const { name, email } = req.body || {};
  const fieldErrors = {};

  if (name === undefined || name === null || typeof name !== 'string' || name.trim().length === 0) {
    fieldErrors.name = 'Full name is required.';
  } else if (name.trim().length > 255) {
    fieldErrors.name = 'Name cannot exceed 255 characters.';
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email === undefined || email === null || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    fieldErrors.email = 'A valid email address is required.';
  } else if (email.trim().length > 255) {
    fieldErrors.email = 'Email cannot exceed 255 characters.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Student creation payload failed validation.',
      requestId: req.requestId,
      fieldErrors,
    });
  }

  req.validatedStudent = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
  };

  next();
};

module.exports = {
  allowlistFields,
  validatePagination,
  validateAttemptPayload,
  validateStudentUpdatePayload,
  validateStudentCreatePayload,
};
