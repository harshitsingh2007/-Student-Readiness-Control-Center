/**
 * Tenant Isolation Guard & Security Boundary
 * 
 * WHAT: Enforces strict tenant scoping from authenticated context and strips
 *       untrusted client-supplied tenant / role / evaluator identifiers.
 * WHY: Section 4 & 5 non-negotiable rules:
 *      "Never trust: req.body.tenantId, req.query.tenantId, client-selected tenant IDs,
 *       client-supplied role, client-supplied evaluator identity."
 * WHAT PROBLEM IT PREVENTS: Prevents cross-tenant data leakage, IDOR vulnerabilities,
 *      and tenant/evaluator spoofing attacks.
 */

const enforceTenantIsolation = (req, res, next) => {
  if (!req.user || !req.user.tenantId) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authenticated tenant context missing.',
      requestId: req.requestId,
      fieldErrors: {},
    });
  }

  // Authoritative tenant derived strictly from validated token
  const authoritativeTenantId = req.user.tenantId;
  req.tenantId = authoritativeTenantId;

  // Security Defense: Strip client-supplied overrides
  if (req.body && typeof req.body === 'object') {
    delete req.body.tenantId;
    delete req.body.role;
    delete req.body.evaluatorRole;
    delete req.body.evaluatorId;
  }

  if (req.query && typeof req.query === 'object') {
    delete req.query.tenantId;
  }

  // Non-disclosing helper: Returns 404 whether resource is nonexistent or belongs to another tenant
  res.safeNotFound = (resourceName = 'Resource') => {
    return res.status(404).json({
      code: 'NOT_FOUND',
      message: `${resourceName} not found.`,
      requestId: req.requestId,
      fieldErrors: {},
    });
  };

  next();
};

module.exports = { enforceTenantIsolation };
