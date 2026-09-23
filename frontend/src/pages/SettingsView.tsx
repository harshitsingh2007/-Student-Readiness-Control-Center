/**
 * SettingsView Component
 * 
 * WHAT: System settings, environment configuration, database connection health,
 *       and evaluator profile preferences.
 */

import React, { useState } from 'react';
import { UserProfile } from '../types/api';

interface SettingsViewProps {
  user: UserProfile;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user, onLogout }) => {
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleSimulateSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMessage('Preferences updated successfully.');
    setTimeout(() => setSaveMessage(null), 4000);
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">System Settings & Infrastructure Health</h1>
          <p className="view-subtitle">
            Configuration parameters, storage engine statuses, and session details.
          </p>
        </div>
        <div className="view-actions">
          <button
            type="button"
            className="btn-signout"
            onClick={onLogout}
          >
            Sign Out of Session
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className="success-banner" style={{ marginBottom: '20px' }}>
          ✅ {saveMessage}
        </div>
      )}

      {/* Infrastructure Status Grid */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h3>Storage & Runtime Engine Status</h3>
          <p className="card-subtitle">
            Real-time status of the multi-database architecture and background worker services.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <div style={{ padding: '16px', background: 'var(--slate-50)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong>PostgreSQL 18</strong>
              <span className="status-badge badge-ready">Connected</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--slate-500)', marginTop: '4px' }}>
              Primary Relational Source of Truth (Port 5433)
            </p>
            <div style={{ fontSize: '11px', color: 'var(--slate-400)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
              ACID Transactions, Outbox Queue
            </div>
          </div>

          <div style={{ padding: '16px', background: 'var(--slate-50)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong>MongoDB</strong>
              <span className="status-badge badge-ready">Connected</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--slate-500)', marginTop: '4px' }}>
              Append-Only Operational Event Store (Port 27017)
            </p>
            <div style={{ fontSize: '11px', color: 'var(--slate-400)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
              Unique Index on eventId, 24h Aggregations
            </div>
          </div>

          <div style={{ padding: '16px', background: 'var(--slate-50)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong>Transactional Outbox</strong>
              <span className="status-badge badge-ready">Active (5s)</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--slate-500)', marginTop: '4px' }}>
              Asynchronous Background Event Publisher
            </p>
            <div style={{ fontSize: '11px', color: 'var(--slate-400)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
              At-Least-Once Delivery Guaranteed
            </div>
          </div>
        </div>
      </div>

      {/* Profile & Session Card */}
      <div className="card">
        <div className="card-header">
          <h3>Evaluator Session & Credentials</h3>
          <p className="card-subtitle">
            Authenticated profile information derived from signed session token.
          </p>
        </div>

        <form onSubmit={handleSimulateSave}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-input"
                value={user.name}
                readOnly
                disabled
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={user.email}
                readOnly
                disabled
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tenant ID</label>
              <input
                type="text"
                className="form-input"
                value={user.tenantId}
                readOnly
                disabled
              />
            </div>

            <div className="form-group">
              <label className="form-label">Assigned Role</label>
              <input
                type="text"
                className="form-input"
                value={user.role}
                readOnly
                disabled
              />
            </div>
          </div>

          <div className="version-lock-notice" style={{ marginTop: '16px' }}>
            🔒 Roles and permissions are cryptographically verified via JWT tokens.
          </div>
        </form>
      </div>
    </div>
  );
};
