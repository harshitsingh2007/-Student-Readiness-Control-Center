/**
 * A4-Style Authoritative SQL Readiness Calculation & Score Drift Detection
 * 
 * WHAT: Single PostgreSQL query that computes latest attempt per student and competency,
 *       resolves equal timestamps deterministically using attempt ID, calculates weighted score
 *       via LEFT JOIN, treats missing competencies as zero, and filters for students whose
 *       stored current_score differs from the calculated score.
 * WHY: Section 13 & Part A4 requirement.
 * WHAT PROBLEM IT PREVENTS: Detects background score drift, race conditions where
 *      readiness was updated in application memory incorrectly, or missing attempt aggregation.
 */

const A4_READINESS_DRIFT_SQL = `
WITH ranked_attempts AS (
    -- 1. Rank non-void attempts per student and competency
    -- Deterministic tie-breaker: submitted_at DESC, then id DESC
    SELECT 
        a.tenant_id,
        a.student_id,
        a.competency_id,
        a.score,
        ROW_NUMBER() OVER (
            PARTITION BY a.student_id, a.competency_id 
            ORDER BY a.submitted_at DESC, a.id DESC
        ) as rn
    FROM attempts a
    WHERE a.is_void = FALSE
      AND a.tenant_id = $1
),
latest_attempts AS (
    -- 2. Pick only rank 1 (latest attempt)
    SELECT tenant_id, student_id, competency_id, score
    FROM ranked_attempts
    WHERE rn = 1
),
student_competency_grid AS (
    -- 3. Cross join students of tenant with active competencies to ensure missing competencies are preserved
    SELECT 
        s.id as student_id,
        s.tenant_id,
        s.name as student_name,
        s.current_score as stored_score,
        s.current_readiness as stored_readiness,
        c.id as competency_id,
        c.key as competency_key,
        c.weight,
        COALESCE(c.required, TRUE) as required
    FROM students s
    CROSS JOIN competencies c
    WHERE s.tenant_id = $1
      AND c.active = TRUE
),
calculated_readiness AS (
    -- 4. Left join to latest attempts; missing competencies count as 0
    SELECT 
        g.student_id,
        g.tenant_id,
        g.student_name,
        g.stored_score,
        g.stored_readiness,
        COUNT(CASE WHEN g.required = TRUE AND c_att.score IS NOT NULL THEN 1 END) as completed_required_competencies,
        COUNT(CASE WHEN g.required = TRUE THEN 1 END) as total_required_competencies,
        ROUND(SUM(COALESCE(c_att.score, 0) * g.weight)::numeric, 2) as calculated_score
    FROM student_competency_grid g
    LEFT JOIN latest_attempts c_att 
        ON g.student_id = c_att.student_id 
       AND g.competency_id = c_att.competency_id
    GROUP BY g.student_id, g.tenant_id, g.student_name, g.stored_score, g.stored_readiness
)
-- 5. Return only students whose calculated score differs from stored score or status is drifted
SELECT 
    student_id,
    tenant_id,
    student_name,
    stored_score,
    calculated_score,
    stored_readiness,
    CASE 
        WHEN completed_required_competencies < total_required_competencies THEN 'INCOMPLETE'
        WHEN calculated_score >= 80 THEN 'READY'
        WHEN calculated_score >= 65 THEN 'NEARLY_READY'
        WHEN calculated_score >= 50 THEN 'DEVELOPING'
        ELSE 'NEEDS_PREPARATION'
    END as expected_readiness,
    completed_required_competencies as completed_competencies,
    total_required_competencies
FROM calculated_readiness
WHERE 
    -- Compare score (handling NULLs) or check if readiness status differs
    (stored_score IS NULL AND calculated_score IS NOT NULL)
    OR (stored_score IS NOT NULL AND ABS(stored_score - calculated_score) > 0.01)
    OR (
        stored_readiness != (
            CASE 
                WHEN completed_required_competencies < total_required_competencies THEN 'INCOMPLETE'
                WHEN calculated_score >= 80 THEN 'READY'
                WHEN calculated_score >= 65 THEN 'NEARLY_READY'
                WHEN calculated_score >= 50 THEN 'DEVELOPING'
                ELSE 'NEEDS_PREPARATION'
            END
        )
    );
`;

const findStudentsWithScoreDrift = async (clientOrPool, tenantId) => {
  const res = await clientOrPool.query(A4_READINESS_DRIFT_SQL, [tenantId]);
  return res.rows;
};

module.exports = {
  A4_READINESS_DRIFT_SQL,
  findStudentsWithScoreDrift,
};
