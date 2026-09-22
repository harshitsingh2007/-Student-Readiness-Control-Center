/**
 * useStudents Custom Hook (Part A1 & A2 Request Correctness)
 * 
 * WHAT: Coordinates student list retrieval with debounced search, AbortController cancellation,
 *       out-of-order response discard, and discriminated union state.
 * WHY: Section 17 & 18 requirement:
 *      - User typing quickly (R -> Ra -> Rah -> Rahul) does not issue wasteful parallel requests.
 *      - Obsolete requests are cancelled via AbortController.
 *      - If Request A resolves after Request B, Request A is discarded.
 *      - Failed background refresh preserves previous valid data.
 *      - Tenant switch aborts in-flight queries and resets cache.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getStudents, StudentQueryFilters } from '../services/studentApi';
import { StudentSummary } from '../types/student';
import { PaginatedResponse } from '../types/api';
import { ApiError } from '../services/api';

export type StudentsListState =
  | { status: 'idle' }
  | { status: 'loading'; sequenceId: number }
  | { status: 'success'; data: PaginatedResponse<StudentSummary>; sequenceId: number }
  | { status: 'refreshing'; data: PaginatedResponse<StudentSummary>; sequenceId: number }
  | { status: 'error'; message: string; previousData?: PaginatedResponse<StudentSummary> };

export function useStudents(initialFilters: StudentQueryFilters, currentTenantId: string) {
  const [state, setState] = useState<StudentsListState>({ status: 'idle' });
  const [filters, setFilters] = useState<StudentQueryFilters>(initialFilters);

  // References for request correctness and race condition prevention
  const activeControllerRef = useRef<AbortController | null>(null);
  const sequenceCounterRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTenantRef = useRef<string>(currentTenantId);

  // Update current tenant ref and reset on tenant switch
  useEffect(() => {
    if (currentTenantRef.current !== currentTenantId) {
      currentTenantRef.current = currentTenantId;
      // Abort in-flight requests from the previous tenant immediately!
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
        activeControllerRef.current = null;
      }
      // Reset state so previous tenant's data is never displayed
      setState({ status: 'idle' });
      // Reset page to 1
      setFilters(prev => ({ ...prev, page: 1 }));
    }
  }, [currentTenantId]);

  const executeFetch = useCallback(async (activeFilters: StudentQueryFilters, _isRefresh = false) => {
    // 1. Cancel previous in-flight request
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeControllerRef.current = controller;

    // 2. Increment request sequence ID to guard against out-of-order arrival
    const currentSequenceId = ++sequenceCounterRef.current;
    const requestedTenant = currentTenantRef.current;

    // 3. Set loading / refreshing state (preserving previous data if refreshing)
    setState(prev => {
      if (prev.status === 'success' || prev.status === 'refreshing') {
        return { status: 'refreshing', data: prev.data, sequenceId: currentSequenceId };
      }
      return { status: 'loading', sequenceId: currentSequenceId };
    });

    try {
      const data = await getStudents({
        ...activeFilters,
        signal: controller.signal,
      });

      // 4. Stale Response Protection:
      // Verify sequence ID matches and tenant has not changed
      if (sequenceCounterRef.current === currentSequenceId && currentTenantRef.current === requestedTenant) {
        setState({
          status: 'success',
          data,
          sequenceId: currentSequenceId,
        });
      }
    } catch (err: any) {
      // Ignore AbortError (deliberately cancelled)
      if (err.name === 'AbortError') return;

      // Stale Response Protection for errors as well
      if (sequenceCounterRef.current === currentSequenceId && currentTenantRef.current === requestedTenant) {
        const errorMsg = err instanceof ApiError ? err.message : 'Failed to load students.';
        setState(prev => {
          const previousData = (prev.status === 'success' || prev.status === 'refreshing') ? prev.data : undefined;
          return {
            status: 'error',
            message: errorMsg,
            previousData,
          };
        });
      }
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce by 300ms on typing
    debounceTimerRef.current = setTimeout(() => {
      executeFetch(filters);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [filters, executeFetch]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const updateFilters = useCallback((newFilters: Partial<StudentQueryFilters>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      // Reset to page 1 if search, status, or sort changes
      page: newFilters.page !== undefined ? newFilters.page : (newFilters.search !== undefined || newFilters.status !== undefined ? 1 : prev.page),
    }));
  }, []);

  const refresh = useCallback(() => {
    executeFetch(filters, true);
  }, [executeFetch, filters]);

  return {
    state,
    filters,
    updateFilters,
    refresh,
  };
}
