/**
 * StudentPage Component (Part A2 Discriminated Union Implementation)
 * 
 * WHAT: Full student detail view managing student profile, competency breakdown,
 *       attempt submission form, and MongoDB activity log.
 * WHY: Section 13, 18 & Part A2 requirement:
 *      Uses discriminated union state model. When background refresh fails,
 *      previous valid data remains visible alongside an error notification.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StudentAsyncState } from '../types/student';
import { getStudentById } from '../services/studentApi';
import { StudentDetails } from '../components/StudentDetails';
import { CompetencyTable } from '../components/CompetencyTable';
import { AttemptForm } from '../components/AttemptForm';
import { LoadingState } from '../components/LoadingState';
import { ApiError } from '../services/api';
import { AlertTriangleIcon } from '../components/Icons';

interface StudentPageProps {
  studentId: string;
  onBack: () => void;
}

export const StudentPage: React.FC<StudentPageProps> = ({
  studentId,
  onBack,
}) => {
  // Part A2 Discriminated Union State
  const [asyncState, setAsyncState] = useState<StudentAsyncState>({ status: 'idle' });
  const activeControllerRef = useRef<AbortController | null>(null);
  const requestCounterRef = useRef<number>(0);

  const fetchStudentData = useCallback(async (_isRefresh = false) => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeControllerRef.current = controller;

    const currentReqId = `req_${++requestCounterRef.current}`;

    setAsyncState(prev => {
      if (prev.status === 'success' || prev.status === 'refreshing') {
        return { status: 'refreshing', data: prev.data, requestId: currentReqId };
      }
      return { status: 'loading', requestId: currentReqId };
    });

    try {
      const data = await getStudentById(studentId, controller.signal);
      setAsyncState({
        status: 'success',
        data,
        requestId: currentReqId,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;

      const message = err instanceof ApiError ? err.message : 'Failed to load student details.';
      setAsyncState(prev => {
        // Preserve previous valid data if available (Part A2 requirement!)
        const previousData = (prev.status === 'success' || prev.status === 'refreshing') ? prev.data : undefined;
        return {
          status: 'error',
          message,
          previousData,
          fieldErrors: err instanceof ApiError ? err.fieldErrors : undefined,
        };
      });
    }
  }, [studentId]);

  useEffect(() => {
    fetchStudentData();
    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, [fetchStudentData]);

  // Handle state rendering via exhaustive checking
  const renderContent = () => {
    switch (asyncState.status) {
      case 'idle':
      case 'loading':
        return <LoadingState message="Loading student details and competency evidence..." />;

      case 'error':
        if (!asyncState.previousData) {
          return (
            <div className="card error-card" role="alert">
              <h3>Error Loading Student</h3>
              <p>{asyncState.message}</p>
              <div className="card-actions">
                <button type="button" className="btn-primary" onClick={() => fetchStudentData()}>
                  Try Again
                </button>
                <button type="button" className="btn-secondary" onClick={onBack}>
                  Back to List
                </button>
              </div>
            </div>
          );
        }
        // If previousData exists, fall through to display previous data with warning!
        break;

      case 'conflict':
        // Display conflict state
        return (
          <div className="card conflict-card" role="alert">
            <h3>409 Version Conflict</h3>
            <p>{asyncState.message}</p>
            <button type="button" className="btn-primary" onClick={() => fetchStudentData()}>
              Reload Student
            </button>
          </div>
        );

      case 'success':
      case 'refreshing':
        break;

      default: {
        // Exhaustive check with TypeScript 'never'
        const _exhaustiveCheck: never = asyncState;
        return _exhaustiveCheck;
      }
    }

    // When status is 'success', 'refreshing', or 'error' with previousData:
    const detail = (asyncState.status === 'success' || asyncState.status === 'refreshing') 
      ? asyncState.data 
      : asyncState.previousData!;

    const isRefreshing = asyncState.status === 'refreshing';
    const refreshError = asyncState.status === 'error' ? asyncState.message : null;

    return (
      <div className="student-detail-layout">
        {/* Refreshing Indicator */}
        {isRefreshing && (
          <div className="refreshing-banner" role="status">
            <span className="spinner-small" /> Refreshing student readiness in background...
          </div>
        )}

        {/* Failed Refresh Banner (preserves previous data) */}
        {refreshError && (
          <div className="error-banner" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangleIcon size={16} style={{ color: 'var(--amber-700)', flexShrink: 0 }} />
            <span>Background refresh failed: {refreshError}. Displaying previously loaded data.</span>
          </div>
        )}

        {/* Student Overview & Inline Editing Card */}
        <StudentDetails
          detail={detail}
          onRefresh={() => fetchStudentData(true)}
        />

        {/* Competency Evidence Breakdown Card */}
        <CompetencyTable
          competencies={detail.competencies}
          readiness={detail.readiness}
        />

        {/* Assessment Attempt Submission Form */}
        <AttemptForm
          studentId={studentId}
          competencies={detail.competencies}
          onAttemptCreated={() => fetchStudentData(true)}
        />
      </div>
    );
  };

  return (
    <div className="student-page-container">
      <div className="student-page-nav">
        <button
          type="button"
          className="btn-back"
          onClick={onBack}
          aria-label="Back to student list"
        >
          ← Back to Students
        </button>
      </div>

      {renderContent()}
    </div>
  );
};
