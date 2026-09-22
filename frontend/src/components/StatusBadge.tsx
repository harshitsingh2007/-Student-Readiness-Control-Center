/**
 * StatusBadge Component
 * 
 * WHAT: Displays an accessible, visually distinct badge for readiness statuses.
 */

import React from 'react';
import { ReadinessStatus } from '../types/student';

interface StatusBadgeProps {
  status: ReadinessStatus | string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getBadgeClass = (s: string) => {
    switch (s) {
      case 'READY':
        return 'badge-ready';
      case 'NEARLY_READY':
        return 'badge-nearly-ready';
      case 'DEVELOPING':
        return 'badge-developing';
      case 'NEEDS_PREPARATION':
        return 'badge-needs-prep';
      case 'INCOMPLETE':
        return 'badge-incomplete';
      default:
        return 'badge-default';
    }
  };

  const getLabel = (s: string) => {
    switch (s) {
      case 'READY':
        return 'Ready';
      case 'NEARLY_READY':
        return 'Nearly Ready';
      case 'DEVELOPING':
        return 'Developing';
      case 'NEEDS_PREPARATION':
        return 'Needs Prep';
      case 'INCOMPLETE':
        return 'Incomplete';
      default:
        return s;
    }
  };

  return (
    <span className={`status-badge ${getBadgeClass(status)}`} role="status" aria-label={`Readiness status: ${status}`}>
      <span className="badge-dot" />
      {getLabel(status)}
    </span>
  );
};
