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

  useEffect(() => {
    if (showAnalyticsModal) {
      setAnalyticsLoading(true);
      getActivityAnalytics()
        .then(data => setAnalytics(data))
        .catch(() => setAnalytics(null))
        .finally(() => setAnalyticsLoading(false));
    }
  }, [showAnalyticsModal, currentTenantId]);

  // Extract data based on discriminated union state
  const isLoading = state.status === 'loading';
  const isRefreshing = state.status === 'refreshing';
  const activeData = (state.status === 'success' || state.status === 'refreshing') ? state.data : null;
  const errorMessage = state.status === 'error' ? state.message : undefined;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header-row">
        <div>
          <h2>Student Readiness Dashboard</h2>
          <p className="page-subtitle">
            Evaluating competency evidence, deterministic tie-breaking, and multi-tenant isolation.
          </p>
        </div>
        <div className="dashboard-actions">
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
    </div>
  );
};
