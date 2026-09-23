/**
 * Centralized API Client & Fetch Wrapper
 * 
 * WHAT: Enforces authenticated requests, AbortSignal support, and strict error parsing.
 * WHY: Section 19 requirement:
 *      Typed API boundary. Never treat unvalidated external JSON as trusted data.
 *      Treat non-2xx HTTP responses as typed errors.
 */

import { ApiErrorResponse } from '../types/api';

const API_BASE_URL = '/api';

export class ApiError extends Error {
  public code: string;
  public requestId: string;
  public fieldErrors: Record<string, string>;
  public currentVersion?: number;
  public statusCode: number;

  constructor(statusCode: number, errorData: Partial<ApiErrorResponse>) {
    super(errorData.message || 'An unexpected API error occurred');
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = errorData.code || 'UNKNOWN_ERROR';
    this.requestId = errorData.requestId || 'client_unknown';
    this.fieldErrors = errorData.fieldErrors || {};
    this.currentVersion = errorData.currentVersion;
  }
}

export interface RequestOptions extends RequestInit {
  token?: string | null;
  validator?: (data: any) => boolean;
}

export async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, validator, ...rest } = options;

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const storedToken = token || localStorage.getItem('srcc_auth_token');
  if (storedToken) {
    defaultHeaders['Authorization'] = `Bearer ${storedToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...rest,
    headers: {
      ...defaultHeaders,
      ...(headers as Record<string, string>),
    },
  });

  // Handle HTTP error responses
  if (!response.ok) {
    let errorJson: Partial<ApiErrorResponse> = {};
    try {
      errorJson = await response.json();
    } catch {
      errorJson = {
        code: `HTTP_${response.status}`,
        message: response.statusText || 'Network request failed',
      };
    }
    throw new ApiError(response.status, errorJson);
  }

  const jsonData = await response.json();

  // Phase 7: Runtime Schema Validation Boundary
  if (validator && !validator(jsonData)) {
    throw new ApiError(502, {
      code: 'INVALID_RESPONSE_SCHEMA',
      message: 'Server response did not conform to the expected client contract schema.',
    });
  }

  return jsonData as T;
}
