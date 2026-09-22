/**
 * useAbortableRequest Hook (Part A1 Resilience)
 * 
 * WHAT: Manages an AbortController instance for cancelable asynchronous requests.
 * WHY: Section 17 & Part A1 requirement:
 *      Automatically cancels obsolete requests on rapid input or component unmount,
 *      preventing memory leaks and stale state updates.
 */

import { useRef, useEffect, useCallback } from 'react';

export function useAbortableRequest() {
  const abortControllerRef = useRef<AbortController | null>(null);

  const getSignal = useCallback(() => {
    // Abort previous in-flight request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current.signal;
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Cancel any pending request on component unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { getSignal, cancelRequest };
}
