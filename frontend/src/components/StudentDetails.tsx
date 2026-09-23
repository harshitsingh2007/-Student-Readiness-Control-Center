/**
 * StudentDetails Component
 * 
 * WHAT: Displays student overview and supports inline editing with optimistic concurrency control.
 * WHY: Section 11 & 18 requirement:
 *      Updates require expectedVersion. Stale updates return 409 Conflict without partial updates.
 *      The UI displays current version and provides conflict resolution.
 */

import React, { useState, useEffect } from 'react';
import { StudentDetail } from '../types/student';
import { StatusBadge } from './StatusBadge';
import { updateStudent } from '../services/studentApi';
import { ApiError } from '../services/api';
import { AlertTriangleIcon, CheckCircleIcon, EditIcon, LockClosedIcon } from './Icons';

interface StudentDetailsProps {
  detail: StudentDetail;
  onRefresh: () => void;
}

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export const StudentDetails: React.FC<StudentDetailsProps> = ({
  detail,
  onRefresh,
}) => {
  const { student, readiness } = detail;

  const [name, setName] = useState(student.name);
  const [email, setEmail] = useState(student.email);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [conflictError, setConflictError] = useState<{ message: string; currentVersion: number } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Synchronize local form when external student data changes
  useEffect(() => {
    setName(student.name);
    setEmail(student.email);
    setConflictError(null);
  }, [student]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setConflictError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      await updateStudent(student.id, {
        expectedVersion: student.version,
        name: name.trim(),
        email: email.trim(),
      });
      setSuccessMessage('Student details updated successfully!');
      setIsEditing(false);
      onRefresh();
    } catch (err: any) {
      const isConflict = (err instanceof ApiError && err.statusCode === 409) ||
                         err?.code === 'VERSION_CONFLICT' ||
                         err?.statusCode === 409;
      if (isConflict) {
        setConflictError({
          message: err.message || 'Version conflict detected.',
          currentVersion: err.currentVersion || (student.version + 1),
        });
      } else {
        alert(err.message || 'Failed to update student.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="card student-overview-card">
      <div className="overview-header">
        <div className="overview-student-title">
          <div className="student-avatar-lg" aria-hidden="true">
            {getInitials(student.name)}
          </div>
          <div>
            <h2>{student.name}</h2>
            <span className="student-id-badge">ID: {student.id}</span>
          </div>
        </div>
        <div className="overview-readiness-box">
          <div className="readiness-score-display">
            {readiness.score !== null ? (
              <span className="large-score">{readiness.score.toFixed(1)}%</span>
            ) : (
              <span className="large-score text-muted">Incomplete</span>
            )}
            <span className="score-subtext">Authoritative Readiness Score</span>
          </div>
          <StatusBadge status={readiness.status} />
        </div>
      </div>

      {conflictError && (
        <div className="conflict-alert-box" role="alert">
          <div className="conflict-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangleIcon size={18} style={{ color: 'var(--amber-700)', flexShrink: 0 }} />
            <strong>409 Version Conflict (Collision Detected)</strong>
          </div>
          <p>{conflictError.message}</p>
          <p className="conflict-details">
            Expected Version: <code>v{student.version}</code> | Database Version: <code>v{conflictError.currentVersion}</code>
          </p>
          <button
            type="button"
            className="btn-conflict-reload"
            onClick={onRefresh}
          >
            Reload Latest Student Data
          </button>
        </div>
      )}

      {successMessage && (
        <div className="success-banner" role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircleIcon size={16} style={{ color: 'var(--emerald-600)', flexShrink: 0 }} />
          <span>{successMessage}</span>
        </div>
      )}

      {!isEditing ? (
        <div className="student-info-grid">
          <div className="info-item">
            <span className="info-label">Full Name:</span>
            <span className="info-value">{student.name}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Email Address:</span>
            <span className="info-value">{student.email}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Current Version:</span>
            <span className="info-value">
              <span className="version-pill">v{student.version}</span>
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Enrolled:</span>
            <span className="info-value">{new Date(student.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="info-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsEditing(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <EditIcon size={14} />
              <span>Edit Profile</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="edit-student-form">
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="edit-name" className="form-label">Full Name</label>
              <input
                id="edit-name"
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSaving}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-email" className="form-label">Email Address</label>
              <input
                id="edit-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSaving}
                required
              />
            </div>
          </div>
          <div className="version-lock-notice" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LockClosedIcon size={14} />
            <span>Guarded by expectedVersion: <code>v{student.version}</code></span>
          </div>
          <div className="form-actions">
            <button
              type="submit"
              className="btn-submit"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setIsEditing(false);
                setName(student.name);
                setEmail(student.email);
                setConflictError(null);
              }}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
