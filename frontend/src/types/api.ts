/**
 * Standardized API Types & Error Contract
 * 
 * WHAT: Type definitions for API requests, responses, pagination, and error envelopes.
 * WHY: Section 9 & 19 typed API boundary requirement:
 *      Do not treat unvalidated external JSON as trusted application data.
 */

export interface ApiErrorResponse {
  code: string;
  message: string;
  requestId: string;
  fieldErrors?: Record<string, string>;
  currentVersion?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
  summaryScore: number;
  requestId: string;
}

export interface UserProfile {
  id: string;
  tenantId: string;
  tenantName?: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'EVALUATOR';
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
  requestId: string;
}

export interface TenantOption {
  id: string;
  name: string;
  status: string;
}
