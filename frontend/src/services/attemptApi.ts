/**
 * Attempt & Analytics API Service
 * 
 * WHAT: Typed API calls for assessment submission and 24h anomaly analytics.
 */

import { apiClient } from './api';
import { SubmitAttemptPayload, SubmitAttemptResponse, ActivityAnalyticsSummary } from '../types/attempt';
import { isAssessmentAttemptResponse, isAnalyticsSummary } from '../utils/validators';

export async function submitAssessmentAttempt(
  studentId: string,
  payload: SubmitAttemptPayload,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<SubmitAttemptResponse> {
  return apiClient<SubmitAttemptResponse>(`/students/${studentId}/attempts`, {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
    validator: isAssessmentAttemptResponse,
    signal,
  });
}

export async function getActivityAnalytics(signal?: AbortSignal): Promise<ActivityAnalyticsSummary> {
  return apiClient<ActivityAnalyticsSummary>('/analytics/activity-summary', {
    validator: isAnalyticsSummary,
    signal,
  });
}
