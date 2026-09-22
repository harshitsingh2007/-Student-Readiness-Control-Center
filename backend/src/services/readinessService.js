/**
 * Readiness Calculation Service (Data-Driven Engine)
 * 
 * WHAT: Authoritative server-side calculation of student competency scores and readiness status.
 * WHY: Section 3 & 12 requirement:
 *      1. Data-driven competencies (adding a 5th competency requires zero code changes).
 *      2. Latest non-voided attempt per competency with deterministic tie-breaking (equal timestamps -> higher ID wins).
 *      3. INCOMPLETE status if any required competency has no valid attempt.
 *      4. Strict score thresholds:
 *         - score >= 80: READY
 *         - 65 <= score < 80: NEARLY_READY
 *         - 50 <= score < 65: DEVELOPING
 *         - score < 50: NEEDS_PREPARATION
 * WHAT PROBLEM IT PREVENTS: Prevents client-side score tampering, inconsistent tie resolution,
 *      and race conditions during score updates.
 */

const { query } = require('../config/postgres');

/**
 * Fetch all active competencies from the database (data-driven).
 */
const getActiveCompetencies = async (db = null) => {
  const executor = db || { query };
  const res = await executor.query(
    `SELECT id, key, name, weight::float as weight, active 
     FROM competencies 
     WHERE active = TRUE 
     ORDER BY key ASC;`
  );
  return res.rows;
};

/**
 * Pure calculation function (easily unit-testable without database mocks).
 * 
 * @param {Array} activeCompetencies - Array of active competency objects from database
 * @param {Array} nonVoidAttempts - Array of attempt objects for a student
 * @returns {Object} { score, status, evidence, missingCompetencies }
 */
const computeReadinessFromAttempts = (activeCompetencies, nonVoidAttempts) => {
  // Group non-void attempts by competency_id
  const attemptsByComp = new Map();

  for (const att of nonVoidAttempts) {
    if (att.is_void) continue;
    const compId = att.competency_id;
    if (!attemptsByComp.has(compId)) {
      attemptsByComp.set(compId, []);
    }
    attemptsByComp.get(compId).push(att);
  }

  // Pick latest attempt per competency using deterministic tie-breaker:
  // Order: submitted_at DESC, then id DESC (higher id wins on equal timestamp)
  const evidence = {};
  const missingCompetencies = [];
  let weightedScoreSum = 0;
  let totalWeight = 0;

  for (const comp of activeCompetencies) {
    totalWeight += comp.weight;
    const compAttempts = attemptsByComp.get(comp.id) || [];

    if (compAttempts.length === 0) {
      missingCompetencies.push({ key: comp.key, name: comp.name });
      evidence[comp.key] = null;
      continue;
    }

    // Deterministic sort: submitted_at DESC, then id DESC
    compAttempts.sort((a, b) => {
      const timeDiff = new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      // Tie-breaker: higher ID wins
      return Number(b.id) - Number(a.id);
    });

    const latest = compAttempts[0];
    const scoreNum = Number(latest.score);

    evidence[comp.key] = {
      attemptId: latest.id,
      score: scoreNum,
      submittedAt: latest.submitted_at,
      evaluatorId: latest.evaluator_id,
      notes: latest.notes,
    };

    weightedScoreSum += scoreNum * comp.weight;
  }

  // Normalize by total active weight if weights don't sum to exactly 1.0
  const finalScore = totalWeight > 0 ? Math.round((weightedScoreSum / totalWeight) * 100) / 100 : 0;

  // Status calculation
  let status = 'INCOMPLETE';
  if (missingCompetencies.length > 0) {
    status = 'INCOMPLETE';
  } else if (finalScore >= 80.00) {
    status = 'READY';
  } else if (finalScore >= 65.00) {
    status = 'NEARLY_READY';
  } else if (finalScore >= 50.00) {
    status = 'DEVELOPING';
  } else {
    status = 'NEEDS_PREPARATION';
  }

  return {
    score: missingCompetencies.length > 0 ? finalScore : finalScore,
    status,
    evidence,
    missingCompetencies,
  };
};

/**
 * Recalculates student readiness inside an active database transaction.
 */
const recalculateStudentReadiness = async (client, tenantId, studentId) => {
  const activeCompetencies = await getActiveCompetencies(client);

  const attemptsRes = await client.query(
    `SELECT id, competency_id, score::float as score, submitted_at, evaluator_id, is_void, notes 
     FROM attempts 
     WHERE tenant_id = $1 AND student_id = $2 AND is_void = FALSE 
     ORDER BY submitted_at DESC, id DESC;`,
    [tenantId, studentId]
  );

  const result = computeReadinessFromAttempts(activeCompetencies, attemptsRes.rows);

  await client.query(
    `UPDATE students 
     SET current_score = $1, current_readiness = $2, updated_at = NOW() 
     WHERE id = $3 AND tenant_id = $4;`,
    [result.status === 'INCOMPLETE' && result.missingCompetencies.length === activeCompetencies.length ? null : result.score, result.status, studentId, tenantId]
  );

  return result;
};

module.exports = {
  getActiveCompetencies,
  computeReadinessFromAttempts,
  recalculateStudentReadiness,
};
