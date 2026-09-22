/**
 * Student API Service
 * 
 * WHAT: Typed API calls for student listing, details, and optimistic updates.
 */

import { apiClient } from './api';
import { PaginatedResponse } from '../types/api';
import { StudentSummary, StudentDetail } from '../types/student';
import { OperationalActivityEvent } from '../types/attempt';

export interface StudentQueryFilters {
  search?: string;
  status?: string;
  sort?: string;
  order?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}

export async function getStudents(filters: StudentQueryFilters = {}): Promise<PaginatedResponse<StudentSummary>> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.order) params.set('order', filters.order);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  return apiClient<PaginatedResponse<StudentSummary>>(`/students${queryStr}`, {
    signal: filters.signal,
  });
}

export async function getStudentById(id: string, signal?: AbortSignal): Promise<StudentDetail> {
  return apiClient<StudentDetail>(`/students/${id}`, { signal });
}

export interface UpdateStudentPayload {
  expectedVersion: number;
  name?: string;
  email?: string;
}

export async function updateStudent(id: string, payload: UpdateStudentPayload, signal?: AbortSignal): Promise<{ student: StudentSummary; message: string }> {
  return apiClient<{ student: StudentSummary; message: string }>(`/students/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    signal,
  });
}

export async function getStudentActivity(id: string, page = 1, signal?: AbortSignal): Promise<{ events: OperationalActivityEvent[]; pagination: any; warning?: string }> {
  return apiClient<{ events: OperationalActivityEvent[]; pagination: any; warning?: string }>(`/students/${id}/activity?page=${page}`, {
    signal,
  });
}
