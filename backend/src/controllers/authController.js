/**
 * Authentication Controller
 * 
 * WHAT: Authenticates users, validates passwords against bcrypt hashes,
 *       issues JWTs with authoritative tenant/role claims, and provides tenant switching context.
 * WHY: Section 5 requirement:
 *      - Distinguish roles (ADMIN, EVALUATOR).
 *      - Client cannot claim evaluatorRole = ADMIN.
 *      - Authoritative context determines userId, tenantId, and role.
 */

const bcrypt = require('bcryptjs');
const { query } = require('../config/postgres');
const { generateToken } = require('../middleware/auth');

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Email and password are required.',
        requestId: req.requestId,
        fieldErrors: {
          email: !email ? 'Email is required' : undefined,
          password: !password ? 'Password is required' : undefined,
        },
      });
    }

    // Look up user by email
    const userRes = await query(
      `SELECT u.id, u.tenant_id, u.name, u.email, u.password_hash, u.role, t.name as tenant_name 
       FROM users u 
       JOIN tenants t ON u.tenant_id = t.id 
       WHERE u.email = $1;`,
      [email.trim().toLowerCase()]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
        requestId: req.requestId,
        fieldErrors: {},
      });
    }

    const user = userRes.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
        requestId: req.requestId,
        fieldErrors: {},
      });
    }

    // Generate authoritative token
    const token = generateToken({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
    });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
  try {
    const userRes = await query(
      `SELECT u.id, u.tenant_id, u.name, u.email, u.role, t.name as tenant_name 
       FROM users u 
       JOIN tenants t ON u.tenant_id = t.id 
       WHERE u.id = $1 AND u.tenant_id = $2;`,
      [req.user.userId, req.user.tenantId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: 'Authenticated user record not found.',
        requestId: req.requestId,
        fieldErrors: {},
      });
    }

    return res.status(200).json({
      user: userRes.rows[0],
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/tenants
 * Lists available demo tenants for testing and account switching.
 */
const getAvailableTenants = async (req, res, next) => {
  try {
    const tenantsRes = await query('SELECT id, name, status FROM tenants WHERE status = $1 ORDER BY name ASC;', ['ACTIVE']);
    return res.status(200).json({
      tenants: tenantsRes.rows,
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
};
/**
 * POST /api/auth/demo-login
 * Development/demo helper endpoint.
 * Issues an authoritative JWT token for an existing user without exposing
 * credentials in frontend source code.
 */
const demoLogin = async (req, res, next) => {
  try {
    // Production Security Guardrail: Never expose demo login in production
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: 'Demo login is disabled in production environments.',
        requestId: req.requestId,
        fieldErrors: {},
      });
    }

    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Valid demo email is required.',
        requestId: req.requestId,
        fieldErrors: { email: 'Email required' },
      });
    }

    const userRes = await query(
      `SELECT u.id, u.tenant_id, u.name, u.email, u.role, t.name as tenant_name 
       FROM users u 
       JOIN tenants t ON u.tenant_id = t.id 
       WHERE u.email = $1;`,
      [email.trim().toLowerCase()]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: 'Demo user not found.',
        requestId: req.requestId,
        fieldErrors: {},
      });
    }

    const user = userRes.rows[0];
    const token = generateToken({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
    });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/switch-tenant
 * Safe authenticated tenant switcher.
 * Uses authenticated server-side context to swap to a valid evaluator
 * in target tenant without hard-coding passwords in React code.
 */
const switchTenant = async (req, res, next) => {
  try {
    const { targetTenantId } = req.body || {};
    if (!targetTenantId) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'targetTenantId is required.',
        requestId: req.requestId,
      });
    }

    // In production, strictly enforce membership: user must exist in the target tenant
    if (process.env.NODE_ENV === 'production') {
      const membershipRes = await query(
        `SELECT u.id, u.tenant_id, u.name, u.email, u.role, t.name as tenant_name 
         FROM users u 
         JOIN tenants t ON u.tenant_id = t.id 
         WHERE u.email = $1 AND u.tenant_id = $2;`,
        [req.user.email, targetTenantId]
      );

      if (membershipRes.rows.length === 0) {
        return res.status(403).json({
          code: 'FORBIDDEN',
          message: 'You are not authorized to switch to this tenant.',
          requestId: req.requestId,
        });
      }

      const authorizedUser = membershipRes.rows[0];
      const token = generateToken({
        userId: authorizedUser.id,
        tenantId: authorizedUser.tenant_id,
        role: authorizedUser.role,
        email: authorizedUser.email,
      });

      return res.status(200).json({
        token,
        user: {
          id: authorizedUser.id,
          tenantId: authorizedUser.tenant_id,
          tenantName: authorizedUser.tenant_name,
          name: authorizedUser.name,
          email: authorizedUser.email,
          role: authorizedUser.role,
        },
        requestId: req.requestId,
      });
    }

    // In development/demo, swap to evaluator of target tenant if tenant exists
    const userRes = await query(
      `SELECT u.id, u.tenant_id, u.name, u.email, u.role, t.name as tenant_name 
       FROM users u 
       JOIN tenants t ON u.tenant_id = t.id 
       WHERE u.tenant_id = $1 AND u.role = 'EVALUATOR'
       LIMIT 1;`,
      [targetTenantId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        code: 'TENANT_NOT_FOUND',
        message: 'Target tenant not found or has no available evaluator.',
        requestId: req.requestId,
      });
    }

    const targetUser = userRes.rows[0];
    const token = generateToken({
      userId: targetUser.id,
      tenantId: targetUser.tenant_id,
      role: targetUser.role,
      email: targetUser.email,
    });

    return res.status(200).json({
      token,
      user: {
        id: targetUser.id,
        tenantId: targetUser.tenant_id,
        tenantName: targetUser.tenant_name,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
      },
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  login,
  getMe,
  getAvailableTenants,
  demoLogin,
  switchTenant,
};
