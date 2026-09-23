/**
 * AddStudentModal Component
 * 
 * WHAT: Accessible modal for dynamically creating new student records under the authenticated tenant.
 * WHY: Allows evaluators and administrators to add students without manual database seeding.
 *      Enforces client validation, human-readable error contracts, and prevents double submissions.
 */

import React, { useState, useEffect } from 'react';
import { createStudent } from '../services/studentApi';
import { StudentSummary } from '../types/student';
import { ApiError } from '../services/api';
import { XCircleIcon } from './Icons';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStudentCreated: (newStudent: StudentSummary) => void;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({
  isOpen,
  onClose,
  onStudentCreated,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setEmail('');
      setValidationErrors({});
      setServerError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      errors.name = 'Full name is required.';
    } else if (trimmedName.length > 255) {
      errors.name = 'Name cannot exceed 255 characters.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail) {
      errors.email = 'Email address is required.';
    } else if (!emailRegex.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.';
    } else if (trimmedEmail.length > 255) {
      errors.email = 'Email cannot exceed 255 characters.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const res = await createStudent({
        name: name.trim(),
        email: email.trim().toLowerCase(),
      });

      onStudentCreated(res.student);
      onClose();
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.statusCode === 409 || err.code === 'DUPLICATE_STUDENT_EMAIL') {
          setServerError('A student with this email already exists in this organization.');
        } else if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
          setValidationErrors(err.fieldErrors);
          setServerError(err.message || 'Please correct the highlighted fields.');
        } else {
          setServerError(err.message || 'Failed to create student record.');
        }
      } else {
        setServerError('Unable to connect to backend server. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-student-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <h3 id="add-student-modal-title">Add New Student</h3>
          <button
            type="button"
            className="btn-close-modal"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {serverError && (
              <div className="form-feedback feedback-error" role="alert" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <XCircleIcon size={16} style={{ color: 'var(--rose-600)', flexShrink: 0 }} />
                <span>{serverError}</span>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label htmlFor="student-name-input" className="form-label">
                Full Name <span className="required-star">*</span>
              </label>
              <input
                id="student-name-input"
                type="text"
                className={`form-input ${validationErrors.name ? 'input-error' : ''}`}
                placeholder="e.g. Rahul Kumar"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (validationErrors.name) {
                    setValidationErrors((prev) => ({ ...prev, name: '' }));
                  }
                }}
                disabled={isSubmitting}
                autoFocus
                required
              />
              {validationErrors.name && (
                <span className="error-text" role="alert">
                  {validationErrors.name}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="student-email-input" className="form-label">
                Email <span className="required-star">*</span>
              </label>
              <input
                id="student-email-input"
                type="email"
                className={`form-input ${validationErrors.email ? 'input-error' : ''}`}
                placeholder="e.g. rahul@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (validationErrors.email) {
                    setValidationErrors((prev) => ({ ...prev, email: '' }));
                  }
                }}
                disabled={isSubmitting}
                required
              />
              {validationErrors.email && (
                <span className="error-text" role="alert">
                  {validationErrors.email}
                </span>
              )}
            </div>
          </div>

          <div className="modal-footer" style={{ gap: '12px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner-small" style={{ marginRight: '8px' }} /> Creating Student...
                </>
              ) : (
                'Create Student'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
