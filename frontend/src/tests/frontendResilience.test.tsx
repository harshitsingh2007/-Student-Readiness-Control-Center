/**
 * Frontend Resilience & State Correctness Tests
 * 
 * WHAT: Tests out-of-order response discard, AbortController cancellation,
 *       tenant switching data isolation, and optimistic concurrency conflict UI.
 * WHY: Section 22, 25 & Part A1, A2 requirements:
 *      Proves the fix for the seeded defect and guarantees state correctness.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { StudentDetails } from '../components/StudentDetails';
import { AddStudentModal } from '../components/AddStudentModal';
import { useStudents } from '../hooks/useStudents';
import * as studentApi from '../services/studentApi';
import { StudentDetail } from '../types/student';

import { ApiError } from '../services/api';

describe('Frontend State Correctness & Resilience', () => {
  describe('Part A1: Out-of-Order Response Protection & Debounce', () => {
    test('older response arriving later does NOT overwrite newer results', async () => {
      vi.useFakeTimers();

      let resolveRequestA: (val: any) => void;
      let resolveRequestB: (val: any) => void;

      const promiseA = new Promise((resolve) => { resolveRequestA = resolve; });
      const promiseB = new Promise((resolve) => { resolveRequestB = resolve; });

      const mockGetStudents = vi.spyOn(studentApi, 'getStudents');
      mockGetStudents
        .mockImplementationOnce(() => promiseA as any) // Request A (older)
        .mockImplementationOnce(() => promiseB as any); // Request B (newer)

      const { result } = renderHook(() =>
        useStudents({ search: '', status: '', page: 1 }, 'tenant-alpha')
      );

      // Trigger first query "R"
      act(() => {
        result.current.updateFilters({ search: 'R' });
        vi.advanceTimersByTime(350); // Pass debounce
      });

      // Trigger second query "Rahul"
      act(() => {
        result.current.updateFilters({ search: 'Rahul' });
        vi.advanceTimersByTime(350); // Pass debounce
      });

      // Request B resolves first with newer student
      await act(async () => {
        resolveRequestB({
          items: [{ id: 's2', name: 'Rahul Sharma', currentReadiness: 'READY', version: 1 }],
          pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
          summaryScore: 85,
        });
      });

      // State now holds Request B
      expect(result.current.state.status).toBe('success');
      if (result.current.state.status === 'success') {
        expect(result.current.state.data.items[0].name).toBe('Rahul Sharma');
      }

      // Older Request A finishes LATER with stale data
      await act(async () => {
        resolveRequestA({
          items: [{ id: 's1', name: 'Rohan (STALE)', currentReadiness: 'DEVELOPING', version: 1 }],
          pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
          summaryScore: 50,
        });
      });

      // INVARIANT VERIFICATION: Request A was discarded! Rahul Sharma remains visible!
      expect(result.current.state.status).toBe('success');
      if (result.current.state.status === 'success') {
        expect(result.current.state.data.items[0].name).toBe('Rahul Sharma');
      }

      vi.useRealTimers();
      mockGetStudents.mockRestore();
    });

    test('refresh failure preserves previous valid data alongside error message', async () => {
      vi.useFakeTimers();

      const mockGetStudents = vi.spyOn(studentApi, 'getStudents')
        .mockResolvedValueOnce({
          items: [{
            id: 's1',
            name: 'Initial Student',
            email: 's1@alpha.edu',
            version: 1,
            currentScore: 85,
            currentReadiness: 'READY',
            createdAt: '2026-09-01T00:00:00Z',
            updatedAt: '2026-09-01T00:00:00Z',
          }],
          pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
          summaryScore: 85,
          requestId: 'req_test_123',
        })
        .mockRejectedValueOnce(new ApiError(500, { message: 'Transient gateway error' }));

      const { result } = renderHook(() =>
        useStudents({ search: '', status: '', page: 1 }, 'tenant-alpha')
      );

      // Pass debounce for initial fetch
      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      // 1. Initial success
      expect(result.current.state.status).toBe('success');
      if (result.current.state.status === 'success') {
        expect(result.current.state.data.items[0].name).toBe('Initial Student');
      }

      // 2. Trigger background refresh
      await act(async () => {
        result.current.refresh();
      });

      // 3. Status is 'error', but previous valid data remains available!
      expect(result.current.state.status).toBe('error');
      if (result.current.state.status === 'error') {
        expect(result.current.state.message).toBe('Transient gateway error');
        expect(result.current.state.previousData).toBeDefined();
        expect(result.current.state.previousData?.items[0].name).toBe('Initial Student');
      }

      vi.useRealTimers();
      mockGetStudents.mockRestore();
    });
  });

  describe('Seeded Defect Fix: Multi-Boundary Tenant Switching', () => {
    test('switching tenant aborts in-flight request and resets state', async () => {
      vi.useFakeTimers();

      let abortSignalSeen: AbortSignal | undefined;
      const mockGetStudents = vi.spyOn(studentApi, 'getStudents').mockImplementation((filters?: any) => {
        abortSignalSeen = filters?.signal;
        return new Promise(() => {}); // Never resolves (simulating slow 3G)
      });

      const { result, rerender } = renderHook(
        ({ tenantId }) => useStudents({ search: '', page: 1 }, tenantId),
        { initialProps: { tenantId: 'tenant-alpha' } }
      );

      // Trigger query for Tenant Alpha
      act(() => {
        vi.advanceTimersByTime(350);
      });

      expect(abortSignalSeen).toBeDefined();
      expect(abortSignalSeen?.aborted).toBe(false);

      // Fast tenant switch to Tenant Beta!
      rerender({ tenantId: 'tenant-beta' });

      // Verification: The previous tenant's in-flight request was aborted immediately!
      expect(abortSignalSeen?.aborted).toBe(true);

      // Verification: State was reset to idle so old tenant's data is never displayed
      expect(result.current.state.status).toBe('idle');

      vi.useRealTimers();
      mockGetStudents.mockRestore();
    });
  });

  describe('Optimistic Concurrency & 409 Conflict UI', () => {
    test('renders 409 conflict banner when update fails due to version mismatch', async () => {
      const mockStudentDetail: StudentDetail = {
        student: {
          id: 'student-alpha-1',
          name: 'Aarav Sharma',
          email: 'aarav@alpha.edu',
          version: 1,
          currentScore: 85,
          currentReadiness: 'READY',
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
        readiness: {
          score: 85,
          status: 'READY',
          evidence: {},
          missingCompetencies: [],
        },
        competencies: [],
      };

      const mockUpdate = vi.spyOn(studentApi, 'updateStudent').mockRejectedValue(
        new ApiError(409, {
          code: 'VERSION_CONFLICT',
          message: 'Conflict: Stale version detected. Current student version is 2, but expectedVersion was 1.',
          currentVersion: 2,
        })
      );

      render(<StudentDetails detail={mockStudentDetail} onRefresh={() => {}} />);

      // Click Edit Profile
      const editBtn = screen.getByText(/Edit Profile/i);
      fireEvent.click(editBtn);

      // Click Save Changes
      const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      // Verification: 409 Conflict Banner is displayed with explanation and reload button
      expect(await screen.findByText(/409 Optimistic Concurrency Conflict/i)).toBeInTheDocument();
      expect(screen.getByText(/Current student version is 2/i)).toBeInTheDocument();
      expect(screen.getByText(/Reload Latest Student Data/i)).toBeInTheDocument();

      mockUpdate.mockRestore();
    });
  });

  describe('AddStudentModal Component & Validation', () => {
    test('renders form fields with Full Name and Email', () => {
      render(<AddStudentModal isOpen={true} onClose={() => {}} onStudentCreated={() => {}} />);

      expect(screen.getByText(/Add New Student/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Create Student/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    test('validates empty name and invalid email format', async () => {
      const mockCreate = vi.spyOn(studentApi, 'createStudent');
      render(<AddStudentModal isOpen={true} onClose={() => {}} onStudentCreated={() => {}} />);

      const nameInput = screen.getByLabelText(/Full Name/i);
      const emailInput = screen.getByLabelText(/Email/i);
      const submitBtn = screen.getByRole('button', { name: /Create Student/i });

      // Enter invalid data
      fireEvent.change(nameInput, { target: { value: '   ' } });
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

      await act(async () => {
        fireEvent.click(submitBtn);
      });

      expect(screen.getByText(/Full name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Please enter a valid email address/i)).toBeInTheDocument();
      expect(mockCreate).not.toHaveBeenCalled();

      mockCreate.mockRestore();
    });

    test('submits valid student and invokes onStudentCreated callback', async () => {
      const onCreated = vi.fn();
      const onClose = vi.fn();
      const mockStudent = {
        id: 'student-new-1',
        name: 'Kiran Rao',
        email: 'kiran@alpha.edu',
        version: 1,
        currentScore: null,
        currentReadiness: 'INCOMPLETE' as const,
        createdAt: '2026-09-23T00:00:00Z',
        updatedAt: '2026-09-23T00:00:00Z',
      };

      const mockCreate = vi.spyOn(studentApi, 'createStudent').mockResolvedValue({
        student: mockStudent,
        message: 'Student created successfully.',
      });

      render(<AddStudentModal isOpen={true} onClose={onClose} onStudentCreated={onCreated} />);

      fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Kiran Rao' } });
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'kiran@alpha.edu' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Student/i }));
      });

      expect(mockCreate).toHaveBeenCalledWith({
        name: 'Kiran Rao',
        email: 'kiran@alpha.edu',
      });
      expect(onCreated).toHaveBeenCalledWith(mockStudent);
      expect(onClose).toHaveBeenCalled();

      mockCreate.mockRestore();
    });

    test('displays duplicate email error when backend returns 409 Conflict', async () => {
      const mockCreate = vi.spyOn(studentApi, 'createStudent').mockRejectedValue(
        new ApiError(409, {
          code: 'DUPLICATE_STUDENT_EMAIL',
          message: 'A student with this email already exists.',
        })
      );

      render(<AddStudentModal isOpen={true} onClose={() => {}} onStudentCreated={() => {}} />);

      fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Duplicate Student' } });
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'aarav@alpha.edu' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Student/i }));
      });

      expect(await screen.findByText(/A student with this email already exists in this organization/i)).toBeInTheDocument();

      mockCreate.mockRestore();
    });
  });
});
