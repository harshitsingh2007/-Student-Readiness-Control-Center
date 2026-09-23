/**
 * Authentication & Authorization Middleware
 * 
 * WHAT: Verifies JSON Web Tokens (JWT) and enforces Role-Based Access Control (RBAC).
 * WHY: Establishes the authenticated user context (userId, tenantId, role).
 * WHAT PROBLEM IT PREVENTS: Prevents unauthorized requests, privilege escalation,
 *      and client-claimed roles (e.g. an evaluator claiming evaluatorRole = 'ADMIN').
 */

const jwt = require('jsonwebtoken');

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
};

const generateToken = (payload) => {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
};

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentication token is required. Please provide a valid Bearer token.',
      requestId: req.requestId,
      fieldErrors: {},
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    // Authenticated context determines identity and tenant
    req.user = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
      email: decoded.email,
    };
    next();
  } catch (err) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Invalid, malformed, or expired authentication token.',
      requestId: req.requestId,
      fieldErrors: {},
    });
  }
};

const requireRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Authentication is required.',
        requestId: req.requestId,
        fieldErrors: {},
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: `Forbidden: role '${req.user.role}' lacks permissions for this action. Required: ${allowedRoles.join(', ')}`,
        requestId: req.requestId,
        fieldErrors: {},
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  requireRole,
  generateToken,
  getJwtSecret,
};
