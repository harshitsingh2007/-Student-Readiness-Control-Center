/**
 * Top Header Component (formerly Navbar)
 * 
 * WHAT: Clean, white top SaaS navigation bar.
 * Left: Organization / Tenant Selector
 * Right: Notification icon, user avatar with initials, user name, role badge, Sign Out button.
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
  onOpenAnalytics,
}) => {
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="top-header">
      <div className="top-header-left">
        {user && (
          <TenantSelector
            currentTenantId={user.tenantId}
            onSwitchTenant={onSwitchTenant}
          />
        )}
      </div>

      <div className="top-header-right">
        {onOpenAnalytics && (
          <button
            type="button"
            className="top-header-icon-btn"
            onClick={onOpenAnalytics}
            aria-label="View Operational Analytics"
            title="MongoDB Operational Analytics"
          >
            📊
          </button>
        )}

        <button
          type="button"
          className="top-header-icon-btn"
          aria-label="Notifications"
          title="System Notifications"
        >
          🔔
          <span className="notification-dot" />
        </button>

        {user && (
          <div className="top-user-profile">
            <div className="top-user-avatar">
              {getInitials(user.name)}
            </div>
            <div className="top-user-info">
              <span className="top-user-name">{user.name}</span>
              <span className={`role-badge role-badge-${user.role.toLowerCase()}`}>
                {user.role}
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          className="btn-signout"
          onClick={onLogout}
          aria-label="Sign out of current session"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
};
