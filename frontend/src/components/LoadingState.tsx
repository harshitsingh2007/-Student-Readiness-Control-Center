/**
 * LoadingState Component
 * 
 * WHAT: Accessible spinner and skeleton placeholder.
 */

import React from 'react';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Loading student readiness data...' }) => {
  return (
    <div className="loading-container" role="status" aria-live="polite">
      <div className="spinner" />
      <p className="loading-text">{message}</p>
    </div>
  );
};
