/**
 * Dashboard Page Component
 * 
 * WHAT: Main dashboard displaying student filters, table, URL synchronization, and ops analytics.
 * WHY: Section 15 & 16 requirements:
 *      Student list with search, status filter, stable sorting, pagination, and URL-persisted query state.
 */

import React, { useState, useEffect } from 'react';
import { StudentFilters } from '../components/StudentFilters';
import { StudentTable } from '../components/StudentTable';
import { useStudents } from '../hooks/useStudents';
import { parseUrlQueryState, buildUrlQueryString } from '../utils/urlState';
import { getActivityAnalytics } from '../services/attemptApi';
import { ActivityAnalyticsSummary } from '../types/attempt';
import { AddStudentModal } from '../components/AddStudentModal';
import { StudentSummary } from '../types/student';

interface DashboardProps {
  currentTenantId: string;
  onSelectStudent: (studentId: string) => void;
  showAnalyticsModal: boolean;
  onCloseAnalyticsModal: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentTenantId,
  onSelectStudent,
  showAnalyticsModal,
  onCloseAnalyticsModal,
}) => {
  // Read initial filters from browser URL query string
  const initialUrlState = parseUrlQueryState(window.location.search);
  const { state, filters, updateFilters, refresh } = useStudents(initialUrlState, currentTenantId);

  // Sync state changes back to browser URL
  useEffect(() => {
    const queryString = buildUrlQueryString(filters);
    const newUrl = `${window.location.pathname}${queryString}`;
    window.history.replaceState({}, '', newUrl);
  }, [filters]);

  // Operational Analytics state
  const [analytics, setAnalytics] = useState<ActivityAnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Add Student Modal state
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleStudentCreated = (newStudent: StudentSummary) => {
    refresh();
    setNotification({
      type: 'success',
      message: `Student "${newStudent.name}" created successfully!`,
    });
    setTimeout(() => setNotification(null), 6000);
  };

  useEffect(() => {
    if (showAnalyticsModal) {
      setAnalyticsLoading(true);
      getActivityAnalytics()
        .then(data => setAnalytics(data))
        .catch(() => setAnalytics(null))
        .finally(() => setAnalyticsLoading(false));
    }
  }, [showAnalyticsModal, currentTenantId]);

  // Extract data based on discriminated union state (Section 8: preserves previousData on background refresh failure!)
  const isLoading = state.status === 'loading';
  const isRefreshing = state.status === 'refreshing';
  const activeData =
    state.status === 'success' || state.status === 'refreshing'
      ? state.data
      : state.status === 'error' && state.previousData
      ? state.previousData
      : null;
  const errorMessage = state.status === 'error' ? state.message : undefined;

  // Dynamic KPI Calculations from authoritative active data
  const totalCount = activeData?.pagination?.totalItems ?? activeData?.items?.length ?? 0;
  const readyCount = activeData?.items?.filter((s) => s.currentReadiness === 'READY').length ?? 0;
  const developingCount = activeData?.items?.filter(
    (s) => s.currentReadiness === 'DEVELOPING' || s.currentReadiness === 'NEARLY_READY'
  ).length ?? 0;
  const atRiskCount = activeData?.items?.filter(
    (s) => s.currentReadiness === 'NEEDS_PREPARATION' || s.currentReadiness === 'INCOMPLETE'
  ).length ?? 0;

  // Human-readable localized date
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="dashboard-container">
      {/* SaaS Welcome Greeting & Date Banner */}
      <div className="dashboard-welcome-header">
        <div className="welcome-text-col">
          <h1 className="welcome-heading">Welcome Back!</h1>
          <p className="welcome-subtext">
            Monitor, evaluate, and track student competency readiness across cohorts.
          </p>
        </div>
        <div className="welcome-date-badge" aria-label="Today's Date">
          <span className="date-icon">📅</span>
          <span className="date-text">{formattedDate}</span>
        </div>
      </div>

      {/* 4 Dynamic Metric KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card kpi-total">
          <div className="kpi-icon-wrapper">
            <span className="kpi-icon">👥</span>
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Total Students</span>
            <span className="kpi-value">{totalCount}</span>
            <span className="kpi-note">Enrolled in cohort</span>
          </div>
        </div>

        <div className="kpi-card kpi-ready">
          <div className="kpi-icon-wrapper">
            <span className="kpi-icon">✅</span>
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Ready</span>
            <span className="kpi-value">{readyCount}</span>
            <span className="kpi-note kpi-note-ready">Target met (≥ 80%)</span>
          </div>
        </div>

        <div className="kpi-card kpi-developing">
          <div className="kpi-icon-wrapper">
            <span className="kpi-icon">⚡</span>
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Developing</span>
            <span className="kpi-value">{developingCount}</span>
            <span className="kpi-note kpi-note-dev">In progress (50–79%)</span>
          </div>
        </div>

        <div className="kpi-card kpi-risk">
          <div className="kpi-icon-wrapper">
            <span className="kpi-icon">⚠️</span>
          </div>
          <div className="kpi-details">
            <span className="kpi-label">At Risk / Incomplete</span>
            <span className="kpi-value">{atRiskCount}</span>
            <span className="kpi-note kpi-note-risk">Needs attention</span>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="dashboard-toolbar">
        <div className="toolbar-left">
          <h2 className="toolbar-section-title">Cohort Overview</h2>
        </div>
        <div className="toolbar-right">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAddStudentModal(true)}
          >
            + Add New Student
          </button>
          <button
            type="button"
            className="btn-refresh"
            onClick={refresh}
            disabled={isLoading || isRefreshing}
          >
            🔄 Refresh List
          </button>
        </div>
      </div>

      {notification && (
        <div
          className={`form-feedback feedback-${notification.type}`}
          role="status"
          style={{ marginBottom: '20px' }}
        >
          {notification.type === 'success' ? '✅ ' : '❌ '}
          {notification.message}
        </div>
      )}

      {/* Filter Card */}
      <StudentFilters
        filters={filters}
        onChange={updateFilters}
        disabled={isLoading}
      />

      {/* Student Data Table */}
      <StudentTable
        students={activeData?.items || []}
        pagination={activeData?.pagination}
        summaryScore={activeData?.summaryScore}
        isLoading={isLoading && !activeData}
        isRefreshing={isRefreshing}
        errorMessage={errorMessage}
        onSelectStudent={onSelectStudent}
        onPageChange={(page) => updateFilters({ page })}
      />

      {/* Operational Analytics Modal (Section 24 MongoDB Aggregation) */}
      {showAnalyticsModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h3>MongoDB Operational Anomaly Analytics (24h)</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={onCloseAnalyticsModal}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {analyticsLoading ? (
                <div className="loading-container">
                  <div className="spinner" />
                  <p>Running MongoDB 24h aggregation pipeline...</p>
                </div>
              ) : analytics ? (
                <div className="analytics-content">
                  <div className="analytics-metrics-grid">
                    <div className="metric-box">
                      <span className="metric-num">{analytics.uniqueSuccessfulAssessments}</span>
                      <span className="metric-label">Unique Successful Assessments</span>
                    </div>
                    <div className="metric-box">
                      <span className="metric-num">{analytics.totalOperationalEvents}</span>
                      <span className="metric-label">Total Operational Events</span>
                    </div>
                    <div className="metric-box">
                      <span className="metric-num">{analytics.validationFailureRatePercent}%</span>
                      <span className="metric-label">Validation Failure Rate</span>
                    </div>
                    <div className="metric-box">
                      <span className="metric-num">
                        {analytics.p95SubmissionLatencyMs !== null ? `${analytics.p95SubmissionLatencyMs}ms` : 'N/A'}
                      </span>
                      <span className="metric-label">p95 Submission Latency</span>
                    </div>
                  </div>

                  <div className="analytics-callout">
                    <strong>Architectural Note:</strong> {analytics.explanation}
                  </div>

                  <h4>Duplicate Success Event Anomalies</h4>
                  {analytics.multipleSuccessEventAnomalies.length === 0 ? (
                    <p className="text-success">✅ Zero duplicate success event anomalies detected in the last 24 hours.</p>
                  ) : (
                    <ul className="anomaly-list">
                      {analytics.multipleSuccessEventAnomalies.map((anom) => (
                        <li key={anom.attemptId}>
                          ⚠️ Attempt #{anom.attemptId} has {anom.eventCount} recorded success events (anomaly)!
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="text-error">Unable to retrieve operational analytics from MongoDB.</p>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={onCloseAnalyticsModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Student Modal */}
      <AddStudentModal
        isOpen={showAddStudentModal}
        onClose={() => setShowAddStudentModal(false)}
        onStudentCreated={handleStudentCreated}
      />
    </div>
  );
};
