const express = require('express');
const router = express.Router();
const { getStudents, getStudentById, updateStudent } = require('../controllers/studentController');
const { createAttempt } = require('../controllers/attemptController');
const { getStudentActivity } = require('../controllers/activityController');
const { authenticate, requireRole } = require('../middleware/auth');
const { enforceTenantIsolation } = require('../middleware/tenant');
const { validatePagination, validateAttemptPayload, validateStudentUpdatePayload } = require('../middleware/validation');

// All student routes require authentication & strict tenant isolation
router.use(authenticate);
router.use(enforceTenantIsolation);

// GET /api/students - List students with server search, filter, sort, pagination
router.get('/', validatePagination, getStudents);

// GET /api/students/:id - Get student details & calculated readiness
router.get('/:id', getStudentById);

// PATCH /api/students/:id - Update student with optimistic concurrency (expectedVersion)
router.patch('/:id', validateStudentUpdatePayload, updateStudent);

// POST /api/students/:id/attempts - Submit competency assessment attempt with Idempotency-Key
router.post('/:id/attempts', requireRole(['ADMIN', 'EVALUATOR']), validateAttemptPayload, createAttempt);

// GET /api/students/:id/activity - Operational activity log from MongoDB
router.get('/:id/activity', getStudentActivity);

module.exports = router;
