/**
 * AnalyticsView Component
 * 
 * WHAT: Dedicated operational analytics page displaying 24-hour MongoDB event aggregation,
 *       latency percentiles, failure rates, and duplicate anomaly detection.
 */

import React, { useState, useEffect } from 'react';
import { getActivityAnalytics } from '../services/attemptApi';
import { ActivityAnalyticsSummary } from '../types/attempt';

interface AnalyticsViewProps {
  currentTenantId: string;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ currentTenantId }) => {
  const [analytics, setAnalytics] = useState<ActivityAnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await getActivityAnalytics();
      setAnalytics(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to retrieve MongoDB analytics.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [currentTenantId]);

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">Operational Analytics & Anomaly Detection</h1>
          <p className="view-subtitle">
            24-hour event aggregation pipeline powered by MongoDB append-only operational store.
          </p>
        </div>
        <div className="view-actions">
          <button
            type="button"
            className="btn-refresh"
            onClick={fetchAnalytics}
            disabled={isLoading}
          >
            🔄 Refresh Analytics
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="card loading-container">
          <div className="spinner" />
          <p>Running MongoDB 24-hour aggregation pipeline across operational events...</p>
        </div>
      ) : errorMessage ? (
        <div className="card error-banner" role="alert">
          ⚠️ {errorMessage}
        </div>
      ) : analytics ? (
        <div className="analytics-view-grid">
          {/* Key Metric KPI Cards */}
          <div className="kpi-grid">
            <div className="kpi-card kpi-ready">
              <div className="kpi-icon-wrapper">
                <span className="kpi-icon">🎯</span>
              </div>
              <div className="kpi-details">
                <span className="kpi-label">Unique Assessments</span>
                <span className="kpi-value">{analytics.uniqueSuccessfulAssessments}</span>
                <span className="kpi-note kpi-note-ready">Succeeded in last 24h</span>
              </div>
            </div>

            <div className="kpi-card kpi-total">
              <div className="kpi-icon-wrapper">
                <span className="kpi-icon">📦</span>
              </div>
              <div className="kpi-details">
                <span className="kpi-label">Total Events</span>
                <span className="kpi-value">{analytics.totalOperationalEvents}</span>
                <span className="kpi-note">Ingested into MongoDB</span>
              </div>
            </div>

            <div className="kpi-card kpi-developing">
              <div className="kpi-icon-wrapper">
                <span className="kpi-icon">⚡</span>
              </div>
              <div className="kpi-details">
                <span className="kpi-label">Validation Failure Rate</span>
                <span className="kpi-value">{analytics.validationFailureRatePercent}%</span>
                <span className="kpi-note kpi-note-dev">
                  {analytics.rejectedEvents} rejected requests
                </span>
              </div>
            </div>

            <div className="kpi-card kpi-risk">
              <div className="kpi-icon-wrapper">
                <span className="kpi-icon">⏱️</span>
              </div>
              <div className="kpi-details">
                <span className="kpi-label">p95 Latency</span>
                <span className="kpi-value">
                  {analytics.p95SubmissionLatencyMs !== null
                    ? `${analytics.p95SubmissionLatencyMs}ms`
                    : 'N/A'}
                </span>
                <span className="kpi-note">Assessment pipeline</span>
              </div>
            </div>
          </div>

          {/* Architecture Insights Card */}
          <div className="card" style={{ marginTop: '20px' }}>
            <div className="card-header">
              <h3>Architectural Verification & Pipeline Health</h3>
              <p className="card-subtitle">
                Tenant isolation boundary: <code>{analytics.tenantId}</code> | Time window: <code>{analytics.timeWindow}</code>
              </p>
            </div>
            <div className="analytics-callout" style={{ margin: 0 }}>
              <strong>Pipeline Explanation:</strong> {analytics.explanation}
            </div>
          </div>

          {/* Anomaly Detection Section */}
          <div className="card" style={{ marginTop: '20px' }}>
            <div className="card-header">
              <h3>Duplicate Success Event Anomalies</h3>
              <p className="card-subtitle">
                Monitors MongoDB for instances where the same assessment attempt emitted multiple success events.
              </p>
            </div>

            {analytics.multipleSuccessEventAnomalies.length === 0 ? (
              <div className="success-banner" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✅</span>
                <strong>Zero duplicate success anomalies detected.</strong>
                <span>Idempotency-Key locks in PostgreSQL guaranteed exactly-once processing.</span>
              </div>
            ) : (
              <ul className="anomaly-list">
                {analytics.multipleSuccessEventAnomalies.map((anom) => (
                  <li key={anom.attemptId}>
                    ⚠️ Attempt #{anom.attemptId} generated {anom.eventCount} success events in MongoDB!
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
