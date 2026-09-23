const express = require('express');
const router = express.Router();
const { getActivityAnalytics, getAllTenantsAnalytics } = require('../controllers/activityController');
const { findStudentsWithScoreDrift } = require('../db/queries/a4ScoringQuery');
const { query } = require('../config/postgres');
const { authenticate, requireRole } = require('../middleware/auth');
const { enforceTenantIsolation } = require('../middleware/tenant');

router.use(authenticate);

// GET /api/analytics/activity-summary/all-tenants - Admin-only cross-tenant operational aggregation
router.get('/activity-summary/all-tenants', requireRole(['ADMIN']), getAllTenantsAnalytics);

// Tenant isolation applies to tenant-scoped analytics
router.use(enforceTenantIsolation);

// GET /api/analytics/activity-summary - 24-hour MongoDB aggregation pipeline (tenant-scoped)
router.get('/activity-summary', getActivityAnalytics);

// GET /api/analytics/readiness-drift - A4 authoritative database-side score drift check
router.get('/readiness-drift', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const drifted = await findStudentsWithScoreDrift({ query }, req.tenantId);
    return res.status(200).json({
      tenantId: req.tenantId,
      driftedCount: drifted.length,
      driftedStudents: drifted,
      description: 'Students whose stored current_score differs from authoritative calculated score using SQL A4 tie-breaking and weighting.',
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
