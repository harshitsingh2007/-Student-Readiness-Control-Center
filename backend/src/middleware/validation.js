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
 * Validate and sanitize pagination, search, filter, and sorting parameters.
 * Rejects out-of-bounds parameters with structured 400 validation errors.
 */
const validatePagination = (req, res, next) => {
  const fieldErrors = {};

  let page = 1;
  if (req.query.page !== undefined) {
    const parsedPage = Number(req.query.page);
    if (!Number.isInteger(parsedPage) || parsedPage < 1 || parsedPage > 1000000) {
      fieldErrors.page = 'Page must be an integer between 1 and 1,000,000.';
    } else {
      page = parsedPage;
    }
  }

  let limit = 10;
  if (req.query.limit !== undefined) {
    const parsedLimit = Number(req.query.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      fieldErrors.limit = 'Limit must be an integer between 1 and 50.';
    } else {
      limit = parsedLimit;
    }
  }

  if (req.query.search !== undefined) {
    if (typeof req.query.search !== 'string' || req.query.search.length > 100) {
      fieldErrors.search = 'Search query cannot exceed 100 characters.';
    }
  }

  const allowedSorts = ['name', 'current_score', 'created_at', 'updated_at', 'current_readiness'];
  let sort = 'name';
  if (req.query.sort !== undefined) {
    if (!allowedSorts.includes(req.query.sort)) {
      fieldErrors.sort = `Sort field must be one of: ${allowedSorts.join(', ')}.`;
    } else {
      sort = req.query.sort;
    }
  }

  let order = 'ASC';
  if (req.query.order !== undefined) {
    const upperOrder = String(req.query.order).toUpperCase();
    if (upperOrder !== 'ASC' && upperOrder !== 'DESC') {
      fieldErrors.order = 'Order must be ASC or DESC.';
    } else {
      order = upperOrder;
    }
  }

  const allowedStatuses = ['ALL', 'READY', 'NEARLY_READY', 'DEVELOPING', 'NEEDS_PREPARATION', 'INCOMPLETE'];
  if (req.query.status !== undefined) {
    const upperStatus = String(req.query.status).toUpperCase();
    if (!allowedStatuses.includes(upperStatus)) {
      fieldErrors.status = `Status must be one of: ${allowedStatuses.join(', ')}.`;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Query parameters failed validation bounds.',
      requestId: req.requestId,
      fieldErrors,
    });
  }

  req.pagination = {
    page,
    limit,
    offset: (page - 1) * limit,
  };
  req.sortField = sort;
  req.sortOrder = order;

  next();
};

/**
 * Validates attempt creation payload.
 */
const validateAttemptPayload = async (req, res, next) => {
  const { competencyKey, score, notes } = req.body || {};
  const fieldErrors = {};

  const idempHeader = req.headers ? req.headers['idempotency-key'] : null;
  if (idempHeader && typeof idempHeader === 'string' && idempHeader.length > 255) {
    fieldErrors['headers.idempotency-key'] = 'Idempotency-Key header cannot exceed 255 characters.';
  }

  if (!competencyKey || typeof competencyKey !== 'string') {
    fieldErrors.competencyKey = 'A valid competency key is required.';
  } else if (competencyKey.trim().length > 64) {
    fieldErrors.competencyKey = 'Competency key cannot exceed 64 characters.';
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
