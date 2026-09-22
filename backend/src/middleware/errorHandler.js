/**
 * Global Error Handler & Standardized API Error Contract
 * 
 * WHAT: Catches all unhandled exceptions and formats them into a strict error contract:
 *       { code, message, requestId, fieldErrors }
 * WHY: Enforces Section 9 error contract across all endpoints.
 * WHAT PROBLEM IT PREVENTS: Prevents leaking stack traces, database credentials,
 *      internal query strings, or sensitive server internals to clients.
 */

const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId || req.headers['x-request-id'] || 'req_unknown';
  
  // Default error properties
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected internal error occurred';
  let fieldErrors = err.fieldErrors || {};

  // Handle specific known error scenarios
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  } else if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
    code = 'CONFLICT';
    message = 'A resource with these unique attributes already exists.';
  } else if (err.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400;
    code = 'FOREIGN_KEY_VIOLATION';
    message = 'Referenced entity does not exist.';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Invalid or expired authentication token.';
  }

  // Security check: Never expose stack traces or raw DB errors in production / API responses
  if (statusCode === 500) {
    console.error(`[ErrorHandler] [${requestId}] Internal error:`, {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
    // Sanitize message for client
    message = 'An unexpected internal server error occurred. Please contact support.';
  } else {
    console.warn(`[ErrorHandler] [${requestId}] Client error ${statusCode} (${code}):`, message);
  }

  return res.status(statusCode).json({
    code,
    message,
    requestId,
    fieldErrors,
  });
};

module.exports = { errorHandler };
