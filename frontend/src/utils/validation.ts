/**
 * Accessible Validation Utilities
 */

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateAttemptInput(competencyKey: string, score: string | number): ValidationResult {
  const errors: Record<string, string> = {};

  if (!competencyKey || !competencyKey.trim()) {
    errors.competency = 'Please select a competency.';
  }

  const num = Number(score);
  if (score === '' || score === null || score === undefined || isNaN(num)) {
    errors.score = 'Score is required and must be a number.';
  } else if (num < 0 || num > 100) {
    errors.score = 'Score must be between 0 and 100.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
