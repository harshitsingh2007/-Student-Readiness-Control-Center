/**
 * Navbar Component
 */

import React from 'react';
import { UserProfile } from '../types/api';
import { TenantSelector } from './TenantSelector';

interface NavbarProps {
  user: UserProfile | null;
  onSwitchTenant: (tenantId: string) => void;
  onLogout: () => void;
  onNavigateHome: () => void;
  onOpenAnalytics?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onSwitchTenant,
  onLogout,
  onNavigateHome,
  onOpenAnalytics,
}) => {
  return (
    <header className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand" onClick={onNavigateHome} role="button" tabIndex={0}>
          <span className="brand-icon">🎓</span>
          <span className="brand-title">Student Readiness Control Center</span>
        </div>

        {user && (
          <div className="navbar-controls">
            <TenantSelector
              currentTenantId={user.tenantId}
              onSwitchTenant={onSwitchTenant}
            />

            {onOpenAnalytics && (
              <button
                type="button"
                className="btn-nav"
                onClick={onOpenAnalytics}
                aria-label="View Operational Analytics"
              >
                📊 Ops & Analytics
              </button>
            )}

            <div className="user-profile">
              <span className="user-name">{user.name}</span>
              <span className={`role-tag role-${user.role.toLowerCase()}`}>
                {user.role}
              </span>
            </div>

            <button
              type="button"
              className="btn-logout"
              onClick={onLogout}
              aria-label="Log out"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
