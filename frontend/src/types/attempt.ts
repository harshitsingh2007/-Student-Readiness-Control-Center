/**
 * Attempt & Activity Event Type Definitions
 * 
 * WHAT: Types for assessment submissions, idempotency tracking, and MongoDB operational events.
 */

import { CalculatedReadiness } from './student';

export interface SubmitAttemptPayload {
  competencyKey: string;
  score: number;
  notes?: string;
}

export interface AttemptRecord {
  id: number;
  studentId: string;
  competencyKey: string;
  competencyName: string;
  score: number;
  evaluatorId: string;
  submittedAt: string;
  notes: string | null;
}

export interface SubmitAttemptResponse {
  attempt: AttemptRecord;
  readiness: CalculatedReadiness;
  eventId: string;
  requestId: string;
}

export interface OperationalActivityEvent {
  _id?: string;
  eventId: string;
  tenantId: string;
  studentId: string | null;
  attemptId: number | string | null;
  requestId: string;
  eventType: 'attempt.succeeded' | 'attempt.rejected' | string;
  occurredAt: string;
  metadata: {
    competencyKey?: string;
    score?: number;
    evaluatorId?: string;
    reason?: string;
    newReadiness?: string;
    newOverallScore?: number;
    error?: string;
    latencyMs?: number;
  };
}

export interface ActivityAnalyticsSummary {
  tenantId: string;
  timeWindow: string;
  uniqueSuccessfulAssessments: number;
  totalOperationalEvents: number;
  rejectedEvents: number;
  validationFailureRatePercent: number;
  p95SubmissionLatencyMs: number | null;
  multipleSuccessEventAnomalies: Array<{ attemptId: string | number; eventCount: number }>;
  explanation: string;
}
