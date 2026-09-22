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
          // 2. Anomaly: Multiple success events for the exact same attempt
          duplicateSuccessEvents: [
            { $match: { eventType: 'attempt.succeeded', attemptId: { $ne: null } } },
            { $group: { _id: '$attemptId', count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            {
              $project: {
                attemptId: '$_id',
                eventCount: '$count',
                _id: 0,
              },
            },
          ],
          // 3. Validation failure rate
          eventTypeCounts: [
            { $group: { _id: '$eventType', count: { $sum: 1 } } },
          ],
          // 4. Latency analysis
          latencyStats: [
            { $match: { 'metadata.latencyMs': { $exists: true, $type: 'number' } } },
            {
              $group: {
                _id: null,
                latencies: { $push: '$metadata.latencyMs' },
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

    const totalSubmissions = (eventCounts['attempt.succeeded'] || 0) + (eventCounts['attempt.rejected'] || 0);
    const rejectedCount = eventCounts['attempt.rejected'] || 0;
    const validationFailureRate = totalSubmissions > 0
      ? Math.round((rejectedCount / totalSubmissions) * 10000) / 100
      : 0;

    // Calculate p95 latency if available
    let p95LatencyMs = null;
    const latencies = summary.latencyStats[0]?.latencies || [];
    if (latencies.length > 0) {
      latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(latencies.length * 0.95);
      p95LatencyMs = latencies[p95Index];
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

module.exports = {
  getStudentActivity,
  getActivityAnalytics,
};
