/**
 * Student & Readiness Type Definitions
 * 
 * WHAT: Core domain types for students, competencies, and discriminated union state machine.
 * WHY: Section 18 & Part A2 requirements:
 *      TypeScript discriminated unions prevent impossible states such as loading with stale errors
 *      or missing request identity, and guarantee that background refresh failure preserves previous valid data.
 */

export type ReadinessStatus = 
  | 'READY' 
  | 'NEARLY_READY' 
  | 'DEVELOPING' 
  | 'NEEDS_PREPARATION' 
  | 'INCOMPLETE';

export interface CompetencyDefinition {
  id: string;
  key: string;
  name: string;
  weight: number;
  active: boolean;
}

export interface CompetencyEvidence {
  attemptId: number | string;
  score: number;
  submittedAt: string;
  evaluatorId: string;
  notes: string | null;
}

export interface CalculatedReadiness {
  score: number | null;
  status: ReadinessStatus;
  evidence: Record<string, CompetencyEvidence | null>;
  missingCompetencies: Array<{ key: string; name: string }>;
}

export interface StudentSummary {
  id: string;
  name: string;
  email: string;
  version: number;
  currentScore: number | null;
  currentReadiness: ReadinessStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StudentDetail {
  student: StudentSummary;
  readiness: CalculatedReadiness;
  competencies: CompetencyDefinition[];
}

/**
 * Part A2 Discriminated Union for Student State
 * Eliminates impossible states and cleanly separates loading vs refreshing with previous data.
 */
export type StudentAsyncState =
  | { status: 'idle' }
  | { status: 'loading'; requestId: string }
  | { status: 'success'; data: StudentDetail; requestId: string }
  | { status: 'refreshing'; data: StudentDetail; requestId: string }
  | { status: 'error'; message: string; previousData?: StudentDetail; fieldErrors?: Record<string, string> }
  | { status: 'conflict'; currentVersion: number; message: string; previousData: StudentDetail };
