/**
 * AssessmentsView Component
 * 
 * WHAT: Competency assessment framework, weighting rules, rubrics, and tie-breaking policies.
 */

import React from 'react';
import { StudentsIcon } from '../components/Icons';

interface AssessmentsViewProps {
  onNavigateToStudents: () => void;
}

export const AssessmentsView: React.FC<AssessmentsViewProps> = ({ onNavigateToStudents }) => {
  const competencies = [
    {
      key: 'frontend',
      name: 'Frontend Engineering',
      weight: '30%',
      required: true,
      description: 'Modern component architectures, accessible state management, debouncing, and UI resilience.',
      criteria: 'Evaluates component lifecycle, state models (discriminated unions), and race-condition guards.',
    },
    {
      key: 'backend',
      name: 'Backend Services',
      weight: '30%',
      required: true,
      description: 'RESTful API design, transactional outbox relays, and role-based access control.',
      criteria: 'Evaluates idempotency fingerprinting, database transactions, and error contracts.',
    },
    {
      key: 'databases',
      name: 'Database & Storage',
      weight: '25%',
      required: true,
      description: 'Relational data integrity in PostgreSQL and append-only event stores in MongoDB.',
      criteria: 'Evaluates atomic constraints, row-level locks, indices, and cross-database outbox patterns.',
    },
    {
      key: 'problem_solving',
      name: 'Problem Solving & Architecture',
      weight: '15%',
      required: true,
      description: 'Version collision prevention, boundary isolation, deterministic tie-breaking, and resilient design.',
      criteria: 'Evaluates edge case handling, collision conflict detection, and failover resilience.',
    },
  ];

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">Competency Assessment Framework</h1>
          <p className="view-subtitle">
            Data-driven competency definitions, evaluation weights, and authoritative readiness thresholds.
          </p>
        </div>
        <div className="view-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={onNavigateToStudents}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <StudentsIcon size={16} />
            <span>Record Assessment in Student Roster</span>
          </button>
        </div>
      </div>

      {/* Competencies Grid */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h3>Core Competencies & Weight Allocation</h3>
          <p className="card-subtitle">
            All 4 competencies are required. Total weighted sum equals 100%.
          </p>
        </div>

        <table className="competency-table">
          <thead>
            <tr>
              <th scope="col">Competency</th>
              <th scope="col">Key</th>
              <th scope="col">Weight</th>
              <th scope="col">Requirement</th>
              <th scope="col">Evaluation Scope</th>
            </tr>
          </thead>
          <tbody>
            {competencies.map((comp) => (
              <tr key={comp.key}>
                <td>
                  <strong>{comp.name}</strong>
                  <p style={{ fontSize: '12px', color: 'var(--slate-500)', marginTop: '2px' }}>
                    {comp.description}
                  </p>
                </td>
                <td>
                  <span className="version-pill">{comp.key}</span>
                </td>
                <td>
                  <span className="weight-badge">{comp.weight}</span>
                </td>
                <td>
                  <span className="status-badge badge-ready">Required</span>
                </td>
                <td style={{ fontSize: '13px', color: 'var(--slate-700)' }}>
                  {comp.criteria}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Readiness Thresholds & Rules */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
        <div className="card">
          <div className="card-header">
            <h3>Readiness Threshold Rules</h3>
            <p className="card-subtitle">
              Strict mathematical boundaries applied to authoritative weighted scores.
            </p>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--ready-bg)', borderRadius: '6px', border: '1px solid var(--ready-border)' }}>
              <div>
                <strong style={{ color: 'var(--ready-text)' }}>● Ready</strong>
                <p style={{ fontSize: '12px', color: 'var(--slate-600)' }}>Student is fully prepared for placement.</p>
              </div>
              <strong style={{ color: 'var(--ready-text)' }}>≥ 80.00%</strong>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--nearly-ready-bg)', borderRadius: '6px', border: '1px solid var(--nearly-ready-border)' }}>
              <div>
                <strong style={{ color: 'var(--nearly-ready-text)' }}>● Nearly Ready</strong>
                <p style={{ fontSize: '12px', color: 'var(--slate-600)' }}>Minor competency reinforcement needed.</p>
              </div>
              <strong style={{ color: 'var(--nearly-ready-text)' }}>65.00% – 79.99%</strong>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--developing-bg)', borderRadius: '6px', border: '1px solid var(--developing-border)' }}>
              <div>
                <strong style={{ color: 'var(--developing-text)' }}>● Developing</strong>
                <p style={{ fontSize: '12px', color: 'var(--slate-600)' }}>Active development in progress.</p>
              </div>
              <strong style={{ color: 'var(--developing-text)' }}>50.00% – 64.99%</strong>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--needs-prep-bg)', borderRadius: '6px', border: '1px solid var(--needs-prep-border)' }}>
              <div>
                <strong style={{ color: 'var(--needs-prep-text)' }}>● Needs Preparation</strong>
                <p style={{ fontSize: '12px', color: 'var(--slate-600)' }}>Significant skill development required.</p>
              </div>
              <strong style={{ color: 'var(--needs-prep-text)' }}>&lt; 50.00%</strong>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--incomplete-bg)', borderRadius: '6px', border: '1px solid var(--incomplete-border)' }}>
              <div>
                <strong style={{ color: 'var(--incomplete-text)' }}>● Incomplete</strong>
                <p style={{ fontSize: '12px', color: 'var(--slate-600)' }}>Missing an attempt in at least one required competency.</p>
              </div>
              <strong style={{ color: 'var(--incomplete-text)' }}>Missing Competency</strong>
            </li>
          </ul>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Authoritative Tie-Breaking Policies</h3>
            <p className="card-subtitle">
              Guaranteed deterministic score derivation across re-evaluations.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px', color: 'var(--slate-700)', lineHeight: '1.6' }}>
            <div style={{ padding: '12px', background: 'var(--slate-50)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <strong>1. Timestamp Precedence:</strong>
              <p>When multiple non-void attempts exist for a competency, the attempt with the latest <code>submitted_at</code> timestamp is authoritative.</p>
            </div>
            <div style={{ padding: '12px', background: 'var(--slate-50)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <strong>2. Deterministic ID Tie-Breaker:</strong>
              <p>If two attempts share the exact same microsecond timestamp, the higher numeric <code>attempt_id</code> deterministically wins.</p>
            </div>
            <div style={{ padding: '12px', background: 'var(--slate-50)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <strong>3. Voided Attempt Exclusion:</strong>
              <p>Any attempt marked <code>is_void = true</code> by an authorized evaluator or administrator is strictly excluded from scoring calculations.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
