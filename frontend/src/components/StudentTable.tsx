/**
 * StudentTable Component
 * 
 * WHAT: Displays paginated list of students, summary score, and pagination controls.
 * WHY: Section 16 & 20 requirement:
 *      Clear rendering of loading, refreshing, empty, and success states.
 */

import React from 'react';
import { StudentSummary } from '../types/student';
import { PaginationMeta } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { LoadingState } from './LoadingState';

interface StudentTableProps {
  students: StudentSummary[];
  pagination?: PaginationMeta;
  summaryScore?: number;
  isLoading: boolean;
  isRefreshing: boolean;
  errorMessage?: string;
  onSelectStudent: (studentId: string) => void;
  onPageChange: (newPage: number) => void;
}

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export const StudentTable: React.FC<StudentTableProps> = ({
  students,
  pagination,
  summaryScore,
  isLoading,
  isRefreshing,
  errorMessage,
  onSelectStudent,
  onPageChange,
}) => {
  if (isLoading) {
    return <LoadingState message="Loading students..." />;
  }

  return (
    <div className="table-wrapper">
      {/* Background Refreshing Indicator / Error Notification (Part A1 & A2) */}
      {isRefreshing && (
        <div className="refreshing-banner" role="status" aria-live="polite">
          <span className="spinner-small" /> Updating student list in background...
        </div>
      )}

      {errorMessage && (
        <div className="error-banner" role="alert">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Summary Score Bar */}
      {summaryScore !== undefined && summaryScore !== null && (
        <div className="summary-score-bar">
          <span className="summary-title">Organization Readiness Average:</span>
          <span className="summary-value">{summaryScore > 0 ? `${summaryScore}%` : 'N/A'}</span>
          <span className="summary-count">({pagination?.totalItems || students.length} students enrolled)</span>
        </div>
      )}

      {students.length === 0 ? (
        <div className="empty-state-card">
          <span className="empty-icon">📂</span>
          <h3>No students found</h3>
          <p>No students match your current search and filter criteria.</p>
        </div>
      ) : (
        <table className="student-table" aria-label="Student Readiness Table">
          <thead>
            <tr>
              <th scope="col">Student Name</th>
              <th scope="col">Email Address</th>
              <th scope="col">Readiness Score</th>
              <th scope="col">Readiness Status</th>
              <th scope="col">Version</th>
              <th scope="col" className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr
                key={student.id}
                className="table-row-clickable"
                onClick={() => onSelectStudent(student.id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelectStudent(student.id);
                  }
                }}
              >
                <td className="student-name-cell">
                  <div className="student-cell-flex">
                    <div className="student-avatar-sm" aria-hidden="true">
                      {getInitials(student.name)}
                    </div>
                    <div className="student-info-col">
                      <strong className="student-name-text">{student.name}</strong>
                      <span className="student-id-subtext">{student.id}</span>
                    </div>
                  </div>
                </td>
                <td className="student-email-cell">{student.email}</td>
                <td className="student-score-cell">
                  {student.currentScore !== null && student.currentScore !== undefined ? (
                    <span className="score-number">{student.currentScore.toFixed(2)}%</span>
                  ) : (
                    <span className="text-muted">Incomplete</span>
                  )}
                </td>
                <td>
                  <StatusBadge status={student.currentReadiness} />
                </td>
                <td>
                  <span className="version-pill">v{student.version}</span>
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    className="btn-action"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectStudent(student.id);
                    }}
                    aria-label={`View details for ${student.name}`}
                  >
                    View Details →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination Footer */}
      {pagination && pagination.totalPages > 1 && (
        <div className="pagination-footer">
          <div className="pagination-info">
            Showing Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong>
            <span className="total-records">({pagination.totalItems} total records)</span>
          </div>
          <div className="pagination-buttons">
            <button
              type="button"
              className="btn-page"
              disabled={pagination.page <= 1 || isRefreshing}
              onClick={() => onPageChange(pagination.page - 1)}
              aria-label="Previous Page"
            >
              ← Previous
            </button>
            <button
              type="button"
              className="btn-page"
              disabled={pagination.page >= pagination.totalPages || isRefreshing}
              onClick={() => onPageChange(pagination.page + 1)}
              aria-label="Next Page"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
