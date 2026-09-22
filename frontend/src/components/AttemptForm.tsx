/**
 * AttemptForm Component
 * 
 * WHAT: Accessible form for submitting new competency evaluation attempts.
 * WHY: Section 21 requirement:
 *      - Accessible validation.
 *      - Duplicate-submit prevention (disables submit while in-flight).
 *      - Client NEVER sends tenantId, evaluatorRole, evaluatorId, or readiness.
 *      - Automatic Idempotency-Key generation & retry support.
 */

import React, { useState } from 'react';
import { CompetencyDefinition } from '../types/student';
import { submitAssessmentAttempt } from '../services/attemptApi';
import { validateAttemptInput } from '../utils/validation';
import { ApiError } from '../services/api';

interface AttemptFormProps {
  studentId: string;
  competencies: CompetencyDefinition[];
  onAttemptCreated: () => void;
}

const generateIdempotencyKey = () => {
  return `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const AttemptForm: React.FC<AttemptFormProps> = ({
  studentId,
  competencies,
  onAttemptCreated,
}) => {
  const [competencyKey, setCompetencyKey] = useState<string>(competencies[0]?.key || '');
  const [score, setScore] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(generateIdempotencyKey());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'replay'; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    // Validate inputs
    const { isValid, errors } = validateAttemptInput(competencyKey, score);
    if (!isValid) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    setIsSubmitting(true);

    try {
      const res = await submitAssessmentAttempt(
        studentId,
        {
          competencyKey,
          score: parseFloat(score),
          notes: notes.trim() || undefined,
        },
        idempotencyKey
      );

      setFeedback({
        type: 'success',
        message: `Attempt #${res.attempt.id} recorded successfully! New readiness score: ${res.readiness.score !== null ? `${res.readiness.score}%` : 'Incomplete'}.`,
      });

      // Clear form and prepare new idempotency key for subsequent submission
      setScore('');
      setNotes('');
      setIdempotencyKey(generateIdempotencyKey());
      onAttemptCreated();
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.statusCode === 422 || err.code === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY') {
          setFeedback({
            type: 'error',
            message: 'Conflict: This Idempotency-Key was already used with different evaluation data.',
          });
        } else {
          setFeedback({
            type: 'error',
            message: err.message || 'Submission failed.',
          });
          if (err.fieldErrors) {
            setValidationErrors(err.fieldErrors);
          }
        }
      } else {
        setFeedback({
          type: 'error',
          message: 'Network error or timeout. You may safely retry using the same Idempotency-Key.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card attempt-form-card">
      <div className="card-header">
        <h3>Record Assessment Attempt</h3>
        <p className="card-subtitle">
          Evaluator identity and tenant are derived strictly from your authenticated session.
        </p>
      </div>

      {feedback && (
        <div className={`form-feedback feedback-${feedback.type}`} role="alert">
          {feedback.type === 'success' ? '✅ ' : '❌ '}
          {feedback.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="attempt-form" noValidate>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="competency-select" className="form-label">
              Competency <span className="required-star">*</span>
            </label>
            <select
              id="competency-select"
              className={`form-input ${validationErrors.competency ? 'input-error' : ''}`}
              value={competencyKey}
              onChange={(e) => setCompetencyKey(e.target.value)}
              disabled={isSubmitting}
              required
            >
              {competencies.map((comp) => (
                <option key={comp.id} value={comp.key}>
                  {comp.name} ({(comp.weight * 100).toFixed(0)}% weight)
                </option>
              ))}
            </select>
            {validationErrors.competency && (
              <span className="error-text" role="alert">{validationErrors.competency}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="score-input" className="form-label">
              Score (0 - 100) <span className="required-star">*</span>
            </label>
            <input
              id="score-input"
              type="number"
              step="0.01"
              min="0"
              max="100"
              className={`form-input ${validationErrors.score ? 'input-error' : ''}`}
              placeholder="e.g. 85.50"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              disabled={isSubmitting}
              required
            />
            {validationErrors.score && (
              <span className="error-text" role="alert">{validationErrors.score}</span>
            )}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="notes-input" className="form-label">Evaluation Notes (Optional)</label>
          <textarea
            id="notes-input"
            className="form-textarea"
            rows={3}
            placeholder="Qualitative feedback, observations, test case results..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        {/* Idempotency Demonstration Badge */}
        <div className="idempotency-info-box">
          <span className="idemp-label">Client Idempotency Key:</span>
          <code className="idemp-key">{idempotencyKey}</code>
          <button
            type="button"
            className="btn-link-small"
            onClick={() => setIdempotencyKey(generateIdempotencyKey())}
            disabled={isSubmitting}
            title="Generate fresh idempotency key"
          >
            Regenerate Key
          </button>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn-submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="spinner-small" /> Submitting & Computing Readiness...
              </>
            ) : (
              'Submit Assessment Attempt'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
