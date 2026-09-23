/**
 * Student Controller (Tenant Scoped & Optimistic Concurrency)
 * 
 * WHAT: Handles listing, details, and optimistic updates for student records.
 * WHY: Section 8, 11, 16 requirements:
 *      - Server-driven search, status filter, stable sorting, pagination, and summary score.
 *      - Latest attempt per competency, calculated readiness, and current version.
 *      - Optimistic concurrency: PATCH requires expectedVersion; returns 409 on conflict.
 * WHAT PROBLEM IT PREVENTS: Prevents cross-tenant data leaks, SQL injection in sorting/filtering,
 *      and lost updates from concurrent evaluator edits.
 */

const { query, getClient } = require('../config/postgres');
const { v4: uuidv4 } = require('uuid');
const { getActiveCompetencies, computeReadinessFromAttempts } = require('../services/readinessService');
const { recordOutboxEvent, flushPendingOutboxEvents } = require('../services/eventPublisher');

/**
 * GET /api/students
 * Lists students within the authenticated tenant with server-side filters, sorting, and pagination.
 */
const getStudents = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { page, limit, offset } = req.pagination;
    const sortField = req.sortField;
    const sortOrder = req.sortOrder;

    const conditions = ['tenant_id = $1'];
    const params = [tenantId];
    let paramIndex = 2;

    // Search filter (name or email)
    if (req.query.search && typeof req.query.search === 'string' && req.query.search.trim().length > 0) {
      const searchPattern = `%${req.query.search.trim()}%`;
      conditions.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      params.push(searchPattern);
      paramIndex++;
    }

    // Status filter
    if (req.query.status && typeof req.query.status === 'string') {
      const allowedStatuses = ['READY', 'NEARLY_READY', 'DEVELOPING', 'NEEDS_PREPARATION', 'INCOMPLETE'];
      const statusUpper = req.query.status.toUpperCase();
      if (allowedStatuses.includes(statusUpper)) {
        conditions.push(`current_readiness = $${paramIndex}`);
        params.push(statusUpper);
        paramIndex++;
      }
    }

    const whereClause = conditions.join(' AND ');

    // 1. Get total count for pagination
    const countRes = await query(
      `SELECT COUNT(*)::int as total FROM students WHERE ${whereClause};`,
      params
    );
    const totalItems = countRes.rows[0].total;

    // 2. Fetch page rows with stable sorting (tie-breaker by id ASC)
    // Note: sortField is allowlisted by validation middleware
    const itemsRes = await query(
      `SELECT id, name, email, version, current_score::float as "currentScore", current_readiness as "currentReadiness", created_at as "createdAt", updated_at as "updatedAt" 
       FROM students 
       WHERE ${whereClause} 
       ORDER BY ${sortField} ${sortOrder}, id ASC 
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1};`,
      [...params, limit, offset]
    );

    // 3. Calculate tenant summary average score
    const avgRes = await query(
      `SELECT ROUND(AVG(current_score)::numeric, 2)::float as "averageScore" 
       FROM students 
       WHERE tenant_id = $1 AND current_score IS NOT NULL;`,
      [tenantId]
    );

    return res.status(200).json({
      items: itemsRes.rows,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
      summaryScore: avgRes.rows[0]?.averageScore || 0,
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/students/:id
 * Retrieves a student with their latest attempt per competency and calculated readiness.
 */
const getStudentById = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const studentId = req.params.id;

    // Fetch student scoped to authenticated tenant
    const studentRes = await query(
      `SELECT id, tenant_id, name, email, version, current_score::float as "currentScore", current_readiness as "currentReadiness", created_at as "createdAt", updated_at as "updatedAt" 
       FROM students 
       WHERE id = $1 AND tenant_id = $2;`,
      [studentId, tenantId]
    );

    if (studentRes.rows.length === 0) {
      // Safe non-disclosing 404
      return res.safeNotFound('Student');
    }

    const student = studentRes.rows[0];

    // Fetch active competencies
    const activeCompetencies = await getActiveCompetencies();

    // Fetch non-void attempts
    const attemptsRes = await query(
      `SELECT id, competency_id, score::float as score, submitted_at, evaluator_id, notes 
       FROM attempts 
       WHERE tenant_id = $1 AND student_id = $2 AND is_void = FALSE 
       ORDER BY submitted_at DESC, id DESC;`,
      [tenantId, studentId]
    );

    // Authoritative readiness calculation
    const readiness = computeReadinessFromAttempts(activeCompetencies, attemptsRes.rows);

    return res.status(200).json({
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        version: student.version,
        currentScore: readiness.score,
        currentReadiness: readiness.status,
        createdAt: student.createdAt,
        updatedAt: student.updatedAt,
      },
      readiness,
      competencies: activeCompetencies,
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/students/:id
 * Updates allowlisted fields with optimistic concurrency control.
 */
const updateStudent = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const studentId = req.params.id;
    const { expectedVersion, updates } = req.validatedStudentUpdate;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'No updatable fields provided. Permitted fields: name, email.',
        requestId: req.requestId,
        fieldErrors: {},
      });
    }

    // Build dynamic parameterized UPDATE statement
    const setClauses = [];
    const params = [studentId, tenantId, expectedVersion];
    let pIndex = 4;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${pIndex}`);
      params.push(updates.name.trim());
      pIndex++;
    }

    if (updates.email !== undefined) {
      setClauses.push(`email = $${pIndex}`);
      params.push(updates.email.trim());
      pIndex++;
    }

    setClauses.push('version = version + 1');
    setClauses.push('updated_at = NOW()');

    const updateSql = `
      UPDATE students 
      SET ${setClauses.join(', ')} 
      WHERE id = $1 AND tenant_id = $2 AND version = $3 
      RETURNING id, name, email, version, current_score::float as "currentScore", current_readiness as "currentReadiness", updated_at as "updatedAt";
    `;

    const updateRes = await query(updateSql, params);

    // If 0 rows updated, inspect whether it was not found or a version conflict
    if (updateRes.rows.length === 0) {
      const checkRes = await query(
        `SELECT id, version FROM students WHERE id = $1 AND tenant_id = $2;`,
        [studentId, tenantId]
      );

      if (checkRes.rows.length === 0) {
        return res.safeNotFound('Student');
      }

      // Record exists but version mismatched -> 409 Conflict
      const currentVersion = checkRes.rows[0].version;
      return res.status(409).json({
        code: 'VERSION_CONFLICT',
        message: `Conflict: Stale version detected. Current student version is ${currentVersion}, but expectedVersion was ${expectedVersion}.`,
        currentVersion,
        requestId: req.requestId,
        fieldErrors: {},
      });
    }

    return res.status(200).json({
      student: updateRes.rows[0],
      message: 'Student updated successfully.',
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/students
 * Creates a new student record scoped to the authenticated tenant.
 * Initializes record with version 1, NULL score, and INCOMPLETE readiness.
 * Transactionally writes a student.created event to the PostgreSQL outbox.
 */
const createStudent = async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = req.tenantId;
    const { name, email } = req.validatedStudent;
    const tenantSlug = tenantId.replace(/^tenant-/, '');
    const studentId = `student-${tenantSlug}-${uuidv4()}`;

    await client.query('BEGIN');

    const insertSql = `
      INSERT INTO students (id, tenant_id, name, email, version, current_score, current_readiness)
      VALUES ($1, $2, $3, $4, 1, NULL, 'INCOMPLETE')
      RETURNING id, name, email, version, current_score::float as "currentScore", current_readiness as "currentReadiness", created_at as "createdAt", updated_at as "updatedAt";
    `;

    let insertRes;
    try {
      insertRes = await client.query(insertSql, [studentId, tenantId, name, email]);
    } catch (dbErr) {
      await client.query('ROLLBACK');
      if (dbErr.code === '23505') {
        return res.status(409).json({
          code: 'DUPLICATE_STUDENT_EMAIL',
          message: 'A student with this email already exists.',
          requestId: req.requestId,
          fieldErrors: { email: 'A student with this email already exists in this organization.' },
        });
      }
      throw dbErr;
    }

    const student = insertRes.rows[0];

    // Transactionally record operational outbox event
    await recordOutboxEvent(client, tenantId, 'student.created', {
      studentId: student.id,
      name: student.name,
      email: student.email,
      actorId: req.user.userId,
      actorRole: req.user.role,
    });

    await client.query('COMMIT');

    // Asynchronously flush outbox event to MongoDB
    flushPendingOutboxEvents().catch((err) => {
      console.warn('[StudentController] Outbox flush warning:', err.message);
    });

    return res.status(201).json({
      student,
      message: 'Student created successfully.',
      requestId: req.requestId,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getStudents,
  getStudentById,
  updateStudent,
  createStudent,
};
