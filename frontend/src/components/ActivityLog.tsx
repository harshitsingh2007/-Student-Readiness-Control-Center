/**
 * ActivityLog Component
 * 
 * WHAT: Displays append-only operational events for a student from MongoDB.
 * WHY: Section 8 & 14 requirement:
 *      Tenant-scoped activity log from MongoDB with bounded pagination.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { OperationalActivityEvent } from '../types/attempt';
import { getStudentActivity } from '../services/studentApi';
import { LoadingState } from './LoadingState';

interface ActivityLogProps {
  studentId: string;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ studentId }) => {
  const [events, setEvents] = useState<OperationalActivityEvent[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const loadEvents = useCallback(async (activePage: number) => {
    setIsLoading(true);
    setWarningMessage(null);
    try {
      const res = await getStudentActivity(studentId, activePage);
      setEvents(res.events || []);
      setTotalPages(res.pagination?.totalPages || 1);
      if (res.warning) {
        setWarningMessage(res.warning);
      }
    } catch {
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadEvents(page);
  }, [loadEvents, page]);

  return (
    <div className="card activity-log-card">
      <div className="card-header">
        <div className="activity-title-group">
          <h3>Operational Activity Audit Log</h3>
          <span className="source-tag">Store: MongoDB (Append-Only)</span>
        </div>
        <button
          type="button"
          className="btn-refresh-small"
          onClick={() => loadEvents(page)}
          disabled={isLoading}
        >
          🔄 Refresh
        </button>
      </div>

      {warningMessage && (
        <div className="warning-banner" role="alert">
          ℹ️ {warningMessage}
        </div>
      )}

      {isLoading ? (
        <LoadingState message="Fetching operational events from MongoDB..." />
      ) : events.length === 0 ? (
        <div className="empty-events-box">
          <p>No operational events recorded for this student yet.</p>
        </div>
      ) : (
        <div className="events-timeline">
          {events.map((evt) => {
            const isSuccess = evt.eventType === 'attempt.succeeded';
            return (
              <div key={evt.eventId || evt._id} className={`timeline-item ${isSuccess ? 'event-success' : 'event-rejected'}`}>
                <div className="event-marker">
                  {isSuccess ? '✓' : '✗'}
                </div>
                <div className="event-content">
                  <div className="event-header-row">
                    <span className={`event-type-badge ${isSuccess ? 'type-success' : 'type-rejected'}`}>
                      {evt.eventType}
                    </span>
                    <span className="event-time">
                      {new Date(evt.occurredAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="event-meta-grid">
                    <div className="meta-item">
                      <span className="meta-label">Event ID:</span>
                      <code>{evt.eventId}</code>
                    </div>
                    {evt.attemptId && (
                      <div className="meta-item">
                        <span className="meta-label">Attempt ID:</span>
                        <code>#{evt.attemptId}</code>
                      </div>
                    )}
                    <div className="meta-item">
                      <span className="meta-label">Request ID:</span>
                      <code>{evt.requestId}</code>
                    </div>
                  </div>

                  {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                    <div className="event-metadata-box">
                      <span className="metadata-title">Event Metadata:</span>
                      <pre className="metadata-json">{JSON.stringify(evt.metadata, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination-small">
          <button
            type="button"
            className="btn-page-small"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage(p => p - 1)}
          >
            ← Newer
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            type="button"
            className="btn-page-small"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage(p => p + 1)}
          >
            Older →
          </button>
        </div>
      )}
    </div>
  );
};
