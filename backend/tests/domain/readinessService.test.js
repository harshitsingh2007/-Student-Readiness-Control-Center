/**
 * Domain Unit Tests: Readiness Calculation Engine
 * 
 * WHAT: Exhaustive tests for readiness scoring, boundary thresholds, missing competencies,
 *       deterministic tie-breaking, and property-based mathematical invariants.
 * WHY: Section 25 domain logic testing requirement.
 */

const { computeReadinessFromAttempts } = require('../../src/services/readinessService');

describe('Readiness Calculation Domain Logic', () => {
  const activeCompetencies = [
    { id: 'comp-fe', key: 'frontend', name: 'Frontend', weight: 0.30 },
    { id: 'comp-be', key: 'backend', name: 'Backend', weight: 0.30 },
    { id: 'comp-db', key: 'databases', name: 'Databases', weight: 0.25 },
    { id: 'comp-ps', key: 'problem_solving', name: 'Problem Solving', weight: 0.15 },
  ];

  const buildAttempts = (scores) => [
    { id: 1, competency_id: 'comp-fe', score: scores.fe, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
    { id: 2, competency_id: 'comp-be', score: scores.be, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
    { id: 3, competency_id: 'comp-db', score: scores.db, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
    { id: 4, competency_id: 'comp-ps', score: scores.ps, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
  ];

  describe('Boundary Thresholds', () => {
    test('score = 80.00 produces READY', () => {
      // 80*0.3 + 80*0.3 + 80*0.25 + 80*0.15 = 80
      const result = computeReadinessFromAttempts(activeCompetencies, buildAttempts({ fe: 80, be: 80, db: 80, ps: 80 }));
      expect(result.status).toBe('READY');
      expect(result.score).toBe(80);
    });

    test('score = 79.99 produces NEARLY_READY', () => {
      const result = computeReadinessFromAttempts(activeCompetencies, buildAttempts({ fe: 79.99, be: 79.99, db: 79.99, ps: 79.99 }));
      expect(result.status).toBe('NEARLY_READY');
      expect(result.score).toBe(79.99);
    });

    test('score = 65.00 produces NEARLY_READY', () => {
      const result = computeReadinessFromAttempts(activeCompetencies, buildAttempts({ fe: 65, be: 65, db: 65, ps: 65 }));
      expect(result.status).toBe('NEARLY_READY');
      expect(result.score).toBe(65);
    });

    test('score = 64.99 produces DEVELOPING', () => {
      const result = computeReadinessFromAttempts(activeCompetencies, buildAttempts({ fe: 64.99, be: 64.99, db: 64.99, ps: 64.99 }));
      expect(result.status).toBe('DEVELOPING');
      expect(result.score).toBe(64.99);
    });

    test('score = 50.00 produces DEVELOPING', () => {
      const result = computeReadinessFromAttempts(activeCompetencies, buildAttempts({ fe: 50, be: 50, db: 50, ps: 50 }));
      expect(result.status).toBe('DEVELOPING');
      expect(result.score).toBe(50);
    });

    test('score = 49.99 produces NEEDS_PREPARATION', () => {
      const result = computeReadinessFromAttempts(activeCompetencies, buildAttempts({ fe: 49.99, be: 49.99, db: 49.99, ps: 49.99 }));
      expect(result.status).toBe('NEEDS_PREPARATION');
      expect(result.score).toBe(49.99);
    });

    test('score = 0.00 produces NEEDS_PREPARATION', () => {
      const result = computeReadinessFromAttempts(activeCompetencies, buildAttempts({ fe: 0, be: 0, db: 0, ps: 0 }));
      expect(result.status).toBe('NEEDS_PREPARATION');
      expect(result.score).toBe(0);
    });
  });

  describe('Missing Competency & INCOMPLETE Rule', () => {
    test('missing one competency results in INCOMPLETE status even if all other scores are 100', () => {
      // Missing problem solving
      const attempts = [
        { id: 1, competency_id: 'comp-fe', score: 100, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
        { id: 2, competency_id: 'comp-be', score: 100, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
        { id: 3, competency_id: 'comp-db', score: 100, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
      ];
      const result = computeReadinessFromAttempts(activeCompetencies, attempts);
      expect(result.status).toBe('INCOMPLETE');
      expect(result.missingCompetencies).toEqual([{ key: 'problem_solving', name: 'Problem Solving' }]);
    });

    test('voided attempts are excluded from readiness evaluation', () => {
      const attempts = [
        { id: 1, competency_id: 'comp-fe', score: 90, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
        { id: 2, competency_id: 'comp-be', score: 90, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
        { id: 3, competency_id: 'comp-db', score: 90, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
        { id: 4, competency_id: 'comp-ps', score: 90, submitted_at: '2026-09-01T10:00:00Z', is_void: true }, // VOIDED!
      ];
      const result = computeReadinessFromAttempts(activeCompetencies, attempts);
      expect(result.status).toBe('INCOMPLETE');
      expect(result.missingCompetencies).toContainEqual({ key: 'problem_solving', name: 'Problem Solving' });
    });
  });

  describe('Deterministic Tie-Breaking', () => {
    test('later timestamp takes precedence over earlier timestamp regardless of ID', () => {
      const attempts = [
        { id: 99, competency_id: 'comp-fe', score: 60, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
        { id: 10, competency_id: 'comp-fe', score: 90, submitted_at: '2026-09-02T10:00:00Z', is_void: false }, // Later time wins
        { id: 3, competency_id: 'comp-be', score: 80, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
        { id: 4, competency_id: 'comp-db', score: 80, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
        { id: 5, competency_id: 'comp-ps', score: 80, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
      ];
      const result = computeReadinessFromAttempts(activeCompetencies, attempts);
      expect(result.evidence.frontend.score).toBe(90);
      expect(result.evidence.frontend.attemptId).toBe(10);
    });

    test('equal timestamps are resolved deterministically using higher attempt ID', () => {
      const attempts = [
        { id: 101, competency_id: 'comp-fe', score: 55, submitted_at: '2026-09-01T12:00:00Z', is_void: false },
        { id: 205, competency_id: 'comp-fe', score: 95, submitted_at: '2026-09-01T12:00:00Z', is_void: false }, // Equal time, higher ID wins
        { id: 3, competency_id: 'comp-be', score: 80, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
        { id: 4, competency_id: 'comp-db', score: 80, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
        { id: 5, competency_id: 'comp-ps', score: 80, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
      ];
      const result = computeReadinessFromAttempts(activeCompetencies, attempts);
      expect(result.evidence.frontend.score).toBe(95);
      expect(result.evidence.frontend.attemptId).toBe(205);
    });
  });

  describe('Property-Based Invariants', () => {
    test('invariant: calculated score is always between 0 and 100 for any valid input combinations', () => {
      for (let i = 0; i < 50; i++) {
        const randScores = {
          fe: Math.random() * 100,
          be: Math.random() * 100,
          db: Math.random() * 100,
          ps: Math.random() * 100,
        };
        const res = computeReadinessFromAttempts(activeCompetencies, buildAttempts(randScores));
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(100);
        expect(['READY', 'NEARLY_READY', 'DEVELOPING', 'NEEDS_PREPARATION']).toContain(res.status);
      }
    });

    test('data-driven extensibility: supports adding a 5th competency seamlessly', () => {
      const fiveCompetencies = [
        ...activeCompetencies.map(c => ({ ...c, weight: 0.20 })),
        { id: 'comp-devops', key: 'devops', name: 'DevOps & Cloud', weight: 0.20 },
      ];
      const attempts = [
        ...buildAttempts({ fe: 80, be: 80, db: 80, ps: 80 }),
        { id: 5, competency_id: 'comp-devops', score: 80, submitted_at: '2026-09-01T10:00:00Z', is_void: false },
      ];
      const result = computeReadinessFromAttempts(fiveCompetencies, attempts);
      expect(result.status).toBe('READY');
      expect(result.score).toBe(80);
      expect(result.evidence.devops.score).toBe(80);
    });
  });
});
