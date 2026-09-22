/**
 * CompetencyTable Component
 * 
 * WHAT: Shows competency breakdown, configured weights, latest attempt scores,
 *       and evaluator evidence for a student.
 * WHY: Section 13 requirement:
 *      Displays authoritative latest non-void attempt per competency,
 *      missing competencies, and weighted contributions.
 */

import React from 'react';
import { CompetencyDefinition, CalculatedReadiness } from '../types/student';

interface CompetencyTableProps {
  competencies: CompetencyDefinition[];
  readiness: CalculatedReadiness;
}

export const CompetencyTable: React.FC<CompetencyTableProps> = ({
  competencies,
  readiness,
}) => {
  return (
    <div className="card competency-breakdown-card">
      <div className="card-header">
        <h3>Competency Evidence & Readiness Breakdown</h3>
        <p className="card-subtitle">
          Scores are derived from the latest non-voided attempt (equal timestamps resolved by attempt ID).
        </p>
      </div>

      <table className="competency-table" aria-label="Competency Evidence Breakdown">
        <thead>
          <tr>
            <th scope="col">Competency</th>
            <th scope="col">Weight</th>
            <th scope="col">Latest Score</th>
            <th scope="col">Weighted Contribution</th>
            <th scope="col">Attempt Evidence</th>
            <th scope="col">Evaluator</th>
            <th scope="col">Evaluated At</th>
          </tr>
        </thead>
        <tbody>
          {competencies.map((comp) => {
            const ev = readiness.evidence[comp.key];
            const weightPercent = (comp.weight * 100).toFixed(0);
            const isMissing = !ev;
            const weightedPoints = ev ? (ev.score * comp.weight).toFixed(2) : '0.00';

            return (
              <tr key={comp.id} className={isMissing ? 'row-missing-competency' : 'row-completed-competency'}>
                <td>
                  <strong>{comp.name}</strong>
                  <span className="comp-key-tag">{comp.key}</span>
                </td>
                <td>
                  <span className="weight-badge">{weightPercent}%</span>
                </td>
                <td>
                  {ev ? (
                    <strong className="score-badge-inline">{ev.score.toFixed(1)}%</strong>
                  ) : (
                    <span className="badge-missing">Missing Attempt</span>
                  )}
                </td>
                <td>
                  <span className="points-value">+{weightedPoints}%</span>
                </td>
                <td>
                  {ev ? (
                    <div className="evidence-details">
                      <span className="attempt-id-tag">Attempt #{ev.attemptId}</span>
                      {ev.notes && <p className="evidence-notes">"{ev.notes}"</p>}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td>
                  {ev ? <span className="evaluator-tag">{ev.evaluatorId}</span> : <span className="text-muted">—</span>}
                </td>
                <td>
                  {ev ? (
                    <span className="timestamp-text">
                      {new Date(ev.submittedAt).toLocaleDateString()} {new Date(ev.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {readiness.missingCompetencies.length > 0 && (
        <div className="missing-warning-banner" role="alert">
          <span className="warning-icon">⚠️</span>
          <div>
            <strong>Incomplete Readiness:</strong> This student is missing attempts in{' '}
            {readiness.missingCompetencies.map(c => c.name).join(', ')}.
            Per business rules, readiness status is strictly <code>INCOMPLETE</code> until all competencies have valid attempts.
          </div>
        </div>
      )}
    </div>
  );
};
