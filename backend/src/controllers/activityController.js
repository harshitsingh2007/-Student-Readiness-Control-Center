/**
 * Operational Activity & Anomaly Analytics Controller
 * 
 * WHAT: Retrieves tenant-scoped operational activity events from MongoDB and
 *       performs aggregation pipelines for anomaly detection.
 * WHY: Section 8 & 24 requirements:
 *      1. GET /api/students/:id/activity: bounded pagination from MongoDB.
 *      2. GET /api/analytics/activity-summary: reports unique successful assessments,
 *         validation failure rate, p95 submission latency, and multiple success events.
 * WHAT PROBLEM IT PREVENTS: Detects retry anomalies, duplicate operational events,
 *      and system degradation across tenants.
 */

const { getActivityCollection, connectMongo } = require('../config/mongodb');

/**
 * GET /api/students/:id/activity
 * Returns append-only operational events for a given student from MongoDB.
 */
const getStudentActivity = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const studentId = req.params.id;
    const page = parseInt(req.query.page || '1', 10);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const mongoDb = await connectMongo();
    if (!mongoDb) {
      // MongoDB unreachable; return graceful degraded response
      return res.status(200).json({
        events: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        warning: 'Operational event store is temporarily offline. Relational state is unaffected.',
        requestId: req.requestId,
      });
    }

    const collection = getActivityCollection();
    const query = { tenantId, studentId };

    const [events, total] = await Promise.all([
      collection
        .find(query)
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query),
    ]);

    return res.status(200).json({
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/analytics/activity-summary
 * Aggregation pipeline across the last 24 hours.
 */
const getActivityAnalytics = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const mongoDb = await connectMongo();
    if (!mongoDb) {
      return res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'MongoDB activity service is currently unavailable.',
        requestId: req.requestId,
        fieldErrors: {},
      });
    }

    const collection = getActivityCollection();
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Aggregation pipeline scoped to tenant and last 24h
    const pipeline = [
      {
        $match: {
          tenantId,
          occurredAt: { $gte: last24h },
        },
      },
      {
        $facet: {
          // 1. Unique successful attempts
          uniqueSuccess: [
            { $match: { eventType: 'attempt.succeeded', attemptId: { $ne: null } } },
            { $group: { _id: '$attemptId' } },
            { $count: 'count' },
          ],
          // 2. Anomaly: Multiple success events for the exact same attempt or idempotency key
          duplicateSuccessEvents: [
            { $match: { eventType: 'attempt.succeeded' } },
            {
              $group: {
                _id: {
                  attemptId: '$attemptId',
                  idempotencyKey: { $ifNull: ['$idempotencyKey', '$metadata.idempotencyKey'] },
                },
                count: { $sum: 1 },
              },
            },
            { $match: { count: { $gt: 1 } } },
            {
              $project: {
                attemptId: '$_id.attemptId',
                idempotencyKey: '$_id.idempotencyKey',
                eventCount: '$count',
                _id: 0,
              },
            },
          ],
          // 3. Event counts and validation failure counts
          eventTypeCounts: [
            { $group: { _id: '$eventType', count: { $sum: 1 } } },
          ],
          validationRejections: [
            {
              $match: {
                eventType: 'attempt.rejected',
                $or: [
                  { 'metadata.validationFailure': true },
                  { reason: 'VALIDATION_ERROR' },
                  { reason: 'MISSING_IDEMPOTENCY_KEY' },
                  { reason: 'INVALID_COMPETENCY' },
                  { reason: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY' },
                ],
              },
            },
            { $count: 'count' },
          ],
          // 4. Latency analysis using MongoDB $percentile aggregation operator
          latencyStats: [
            { $match: { eventType: 'attempt.succeeded', 'metadata.latencyMs': { $exists: true, $type: 'number' } } },
            {
              $group: {
                _id: null,
                p95: {
                  $percentile: {
                    input: '$metadata.latencyMs',
                    p: [0.95],
                    method: 'approximate',
                  },
                },
              },
            },
          ],
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    const summary = results[0] || {};

    const uniqueSuccessCount = summary.uniqueSuccess[0]?.count || 0;
    const duplicateSuccessList = summary.duplicateSuccessEvents || [];

    // Calculate failure rate
    const eventCounts = (summary.eventTypeCounts || []).reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    const rejectedCount = eventCounts['attempt.rejected'] || 0;
    const validationFailureCount = summary.validationRejections[0]?.count || rejectedCount;
    const totalSubmissions = (eventCounts['attempt.succeeded'] || 0) + rejectedCount;
    const validationFailureRate = totalSubmissions > 0
      ? Math.round((validationFailureCount / totalSubmissions) * 10000) / 100
      : 0;

    // Extract p95 latency computed by MongoDB aggregation ($percentile accumulator)
    let p95LatencyMs = null;
    const p95Raw = summary.latencyStats[0]?.p95;
    if (Array.isArray(p95Raw) && p95Raw.length > 0 && typeof p95Raw[0] === 'number') {
      p95LatencyMs = Math.round(p95Raw[0] * 100) / 100;
    } else if (typeof p95Raw === 'number') {
      p95LatencyMs = Math.round(p95Raw * 100) / 100;
    }

    return res.status(200).json({
      tenantId,
      timeWindow: 'last_24_hours',
      uniqueSuccessfulAssessments: uniqueSuccessCount,
      totalOperationalEvents: totalSubmissions,
      rejectedEvents: rejectedCount,
      validationFailureRatePercent: validationFailureRate,
      p95SubmissionLatencyMs: p95LatencyMs,
      multipleSuccessEventAnomalies: duplicateSuccessList,
      explanation: 'Naive document counts over-represent successful assessments due to network retries and duplicate operational events. The aggregation uses distinct attemptId grouping to report true logical successes.',
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/analytics/activity-summary/all-tenants
 * ADMIN-only endpoint grouping operational metrics by tenant across MongoDB.
 */
const getAllTenantsAnalytics = async (req, res, next) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Admin access required to view cross-tenant analytics.',
        requestId: req.requestId,
        fieldErrors: {},
      });
    }

    const mongoDb = await connectMongo();
    if (!mongoDb) {
      return res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'MongoDB activity service is currently unavailable.',
        requestId: req.requestId,
        fieldErrors: {},
      });
    }

    const collection = getActivityCollection();
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const pipeline = [
      {
        $match: {
          occurredAt: { $gte: last24h },
        },
      },
      {
        $group: {
          _id: '$tenantId',
          totalEvents: { $sum: 1 },
          successfulAttempts: {
            $addToSet: {
              $cond: [{ $eq: ['$eventType', 'attempt.succeeded'] }, '$attemptId', '$$REMOVE'],
            },
          },
          rejectedCount: {
            $sum: { $cond: [{ $eq: ['$eventType', 'attempt.rejected'] }, 1, 0] },
          },
          validationFailureCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$eventType', 'attempt.rejected'] },
                    { $eq: ['$metadata.validationFailure', true] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          p95Arr: {
            $percentile: {
              input: '$metadata.latencyMs',
              p: [0.95],
              method: 'approximate',
            },
          },
          events: {
            $push: {
              attemptId: '$attemptId',
              idempotencyKey: '$idempotencyKey',
              eventType: '$eventType',
            },
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();

    const report = results.map(row => {
      const successfulAttemptsCount = (row.successfulAttempts || []).filter(Boolean).length;
      const totalSubmissions = successfulAttemptsCount + (row.rejectedCount || 0);
      const validationFailureRate = totalSubmissions > 0
        ? Math.round(((row.validationFailureCount || 0) / totalSubmissions) * 10000) / 100
        : 0;

      let p95LatencyMs = null;
      if (Array.isArray(row.p95Arr) && row.p95Arr.length > 0 && typeof row.p95Arr[0] === 'number') {
        p95LatencyMs = Math.round(row.p95Arr[0] * 100) / 100;
      }

      // Check for duplicate success anomalies
      const successEvents = (row.events || []).filter(e => e.eventType === 'attempt.succeeded' && e.attemptId);
      const countsByAttempt = {};
      successEvents.forEach(e => {
        countsByAttempt[e.attemptId] = (countsByAttempt[e.attemptId] || 0) + 1;
      });
      const duplicateSuccessEvents = Object.keys(countsByAttempt)
        .filter(attId => countsByAttempt[attId] > 1)
        .map(attId => ({ attemptId: attId, eventCount: countsByAttempt[attId] }));

      return {
        tenantId: row._id,
        uniqueSuccessfulAssessments: successfulAttemptsCount,
        validationFailureRatePercent: validationFailureRate,
        p95SubmissionLatencyMs: p95LatencyMs,
        duplicateSuccessEvents,
      };
    });

    return res.status(200).json({
      tenants: report,
      timeWindow: 'last_24_hours',
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStudentActivity,
  getActivityAnalytics,
  getAllTenantsAnalytics,
};
