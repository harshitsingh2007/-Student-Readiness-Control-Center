/**
 * Runtime API Response Validators (Phase 7 Requirement)
 * 
 * WHAT: Validates untrusted external JSON response shapes at the HTTP boundary before React state update.
 * WHY: Protects the application from corrupted responses, missing fields, or contract drift.
 * Flow: HTTP response -> JSON -> Runtime Validation -> Typed Application State.
 */

import { StudentSummary, StudentDetail } from '../types/student';
import { ActivityAnalyticsSummary } from '../types/attempt';
import { ApiErrorResponse } from '../types/api';

/**
 * Validates whether an object conforms to StudentSummary shape.
 */
export function isStudentSummary(data: any): data is StudentSummary {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.id === 'string' &&
    typeof data.name === 'string' &&
    typeof data.email === 'string' &&
    typeof data.version === 'number' &&
    typeof data.currentReadiness === 'string'
  );
}

/**
 * Validates whether an object conforms to StudentDetail shape.
 */
export function isStudentDetail(data: any): data is StudentDetail {
  return (
    typeof data === 'object' &&
    data !== null &&
    isStudentSummary(data.student) &&
    Array.isArray(data.competencies) &&
    typeof data.readiness === 'object' &&
    data.readiness !== null &&
    typeof data.readiness.status === 'string' &&
    typeof data.readiness.evidence === 'object'
  );
}

/**
 * Validates whether an object conforms to an Assessment Attempt response.
 */
export function isAssessmentAttemptResponse(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.attempt === 'object' &&
    data.attempt !== null &&
    typeof data.attempt.competencyKey === 'string' &&
    typeof data.readiness === 'object' &&
    data.readiness !== null &&
    typeof data.readiness.status === 'string'
  );
}

/**
 * Validates whether an object conforms to ActivityAnalyticsSummary.
 */
export function isAnalyticsSummary(data: any): data is ActivityAnalyticsSummary {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.tenantId === 'string' &&
    typeof data.uniqueSuccessfulAssessments === 'number' &&
    typeof data.validationFailureRatePercent === 'number' &&
    Array.isArray(data.multipleSuccessEventAnomalies)
  );
}

/**
 * Validates ApiErrorResponse shape.
 */
export function isApiErrorResponse(data: any): data is ApiErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.code === 'string' &&
    typeof data.message === 'string'
  );
}

/**
 * Validates a paginated list response.
 */
export function isPaginatedList<T>(data: any, itemValidator: (item: any) => item is T): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray(data.items) &&
    data.items.every(itemValidator) &&
    typeof data.pagination === 'object' &&
    data.pagination !== null &&
    typeof data.pagination.page === 'number' &&
    typeof data.pagination.totalItems === 'number'
  );
}

/**
 * Validates CreateStudentResponse shape.
 */
export function isCreateStudentResponse(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    isStudentSummary(data.student) &&
    typeof data.message === 'string'
  );
}

/**
 * Validates CompetencyDefinition shape.
 */
export function isCompetencyDefinition(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.key === 'string' &&
    typeof data.name === 'string' &&
    typeof data.weight === 'number'
  );
}

/**
 * Validates OperationalActivityEvent shape.
 */
export function isActivityEvent(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.eventId === 'string' &&
    typeof data.tenantId === 'string' &&
    typeof data.eventType === 'string' &&
    typeof data.occurredAt === 'string'
  );
}
