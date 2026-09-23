/**
 * OrganizationView Component
 * 
 * WHAT: Multi-tenant organization details, staff directory, and boundary isolation guarantees.
 */

import React from 'react';
import { UserProfile } from '../types/api';
import { RefreshIcon } from '../components/Icons';

interface OrganizationViewProps {
  user: UserProfile;
  onSwitchTenant: (tenantId: string) => void;
}

export const OrganizationView: React.FC<OrganizationViewProps> = ({ user, onSwitchTenant }) => {
  const isAlpha = user.tenantId === 'tenant-alpha';

  const staffDirectory = [
    {
      name: 'Alpha Evaluator',
      email: 'evaluator@alpha.com',
      tenantId: 'tenant-alpha',
      role: 'EVALUATOR',
      status: 'Active',
    },
    {
      name: 'Alpha Admin',
      email: 'admin@alpha.com',
      tenantId: 'tenant-alpha',
      role: 'ADMIN',
      status: 'Active',
    },
    {
      name: 'Beta Evaluator',
      email: 'evaluator@beta.com',
      tenantId: 'tenant-beta',
      role: 'EVALUATOR',
      status: 'Active',
    },
    {
      name: 'Beta Admin',
      email: 'admin@beta.com',
      tenantId: 'tenant-beta',
      role: 'ADMIN',
      status: 'Active',
    },
  ];

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">Organization & Tenant Management</h1>
          <p className="view-subtitle">
            Multi-boundary tenant isolation, authorized staff directory, and organization settings.
          </p>
        </div>
        <div className="view-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => onSwitchTenant(isAlpha ? 'tenant-beta' : 'tenant-alpha')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshIcon size={14} />
            <span>Switch to {isAlpha ? 'Tenant Beta' : 'Tenant Alpha'}</span>
          </button>
        </div>
      </div>

      {/* Current Organization Card */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h3>Active Organization Profile</h3>
          <p className="card-subtitle">
            Current authenticated scope: <strong>{user.tenantId}</strong>
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <div style={{ padding: '14px', background: 'var(--slate-50)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '12px', color: 'var(--slate-500)', fontWeight: 500 }}>ORGANIZATION NAME</span>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--slate-900)', marginTop: '4px' }}>
              {isAlpha ? 'Alpha Institute of Technology' : 'Beta Academy of Computing'}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--primary-600)' }}>Cohort: 2026-Fall</span>
          </div>

          <div style={{ padding: '14px', background: 'var(--slate-50)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '12px', color: 'var(--slate-500)', fontWeight: 500 }}>TENANT IDENTIFIER</span>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--slate-900)', marginTop: '4px' }}>
              <code>{user.tenantId}</code>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ready-text)' }}>Enforced at Database Layer</span>
          </div>

          <div style={{ padding: '14px', background: 'var(--slate-50)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '12px', color: 'var(--slate-500)', fontWeight: 500 }}>YOUR CURRENT ROLE</span>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--slate-900)', marginTop: '4px' }}>
              <span className={`role-badge role-badge-${user.role.toLowerCase()}`}>
                {user.role}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--slate-600)' }}>{user.email}</span>
          </div>
        </div>
      </div>

      {/* Staff Directory Table */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h3>Authorized Evaluators & Administrators</h3>
          <p className="card-subtitle">
            System users provisioned across organizational boundaries.
          </p>
        </div>

        <table className="student-table">
          <thead>
            <tr>
              <th scope="col">Staff Member</th>
              <th scope="col">Email Address</th>
              <th scope="col">Assigned Tenant</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {staffDirectory.map((staff) => {
              const isCurrent = staff.email === user.email;
              return (
                <tr key={staff.email} style={isCurrent ? { backgroundColor: 'var(--primary-50)' } : undefined}>
                  <td>
                    <strong>{staff.name}</strong>
                    {isCurrent && <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--primary-600)', fontWeight: 600 }}>(You)</span>}
                  </td>
                  <td>{staff.email}</td>
                  <td>
                    <span className={`tenant-pill ${staff.tenantId === 'tenant-alpha' ? 'tenant-pill-alpha' : 'tenant-pill-beta'}`}>
                      {staff.tenantId}
                    </span>
                  </td>
                  <td>
                    <span className={`role-badge role-badge-${staff.role.toLowerCase()}`}>
                      {staff.role}
                    </span>
                  </td>
                  <td>
                    <span className="status-badge badge-ready">
                      <span className="badge-dot" /> Active
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Security Architecture Callout */}
      <div className="card">
        <div className="card-header">
          <h3>Multi-Boundary Tenant Isolation Guarantees</h3>
          <p className="card-subtitle">
            How Student Readiness Control Center prevents cross-tenant data leaks and unauthorized mutations.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          <div style={{ padding: '14px', background: 'var(--slate-50)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <strong>1. Untrusted Client Stripping</strong>
            <p style={{ fontSize: '13px', color: 'var(--slate-600)', marginTop: '4px' }}>
              The backend middleware completely strips any client-supplied <code>tenantId</code>, <code>evaluatorId</code>, or <code>role</code> from query parameters and request bodies, deriving them exclusively from signed JWT claims.
            </p>
          </div>

          <div style={{ padding: '14px', background: 'var(--slate-50)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <strong>2. Non-Disclosing 404 Contract</strong>
            <p style={{ fontSize: '13px', color: 'var(--slate-600)', marginTop: '4px' }}>
              If an evaluator from Tenant Alpha queries a student from Tenant Beta, the server returns an opaque <code>404 NOT_FOUND</code> rather than a <code>403 FORBIDDEN</code>, preventing entity enumeration attacks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
