/**
 * Sidebar Component
 * 
 * WHAT: Clean, professional left navigation sidebar for the SaaS dashboard.
 * Features:
 * - Brand logo with graduation cap icon
 * - Primary navigation links (Dashboard, Students, Analytics, Assessments, Reports, Organization, Settings)
 * - Light blue active indicator state (no neon/glowing effects)
 * - Subtle bottom motivational card
 */

import React from 'react';
import {
  GraduationCapIcon,
  DashboardIcon,
  StudentsIcon,
  AnalyticsIcon,
  AssessmentsIcon,
  ReportsIcon,
  OrganizationIcon,
  SettingsIcon,
  SeedlingIcon,
} from './Icons';

export type NavTab = 
  | 'dashboard'
  | 'students'
  | 'analytics'
  | 'assessments'
  | 'reports'
  | 'organization'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenAnalytics?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon size={18} /> },
    { id: 'students', label: 'Students', icon: <StudentsIcon size={18} /> },
    { id: 'analytics', label: 'Analytics', icon: <AnalyticsIcon size={18} /> },
    { id: 'assessments', label: 'Assessments', icon: <AssessmentsIcon size={18} /> },
    { id: 'reports', label: 'Reports', icon: <ReportsIcon size={18} /> },
    { id: 'organization', label: 'Organization', icon: <OrganizationIcon size={18} /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon size={18} /> },
  ];

  return (
    <aside className="app-sidebar" aria-label="Main Navigation">
      {/* Brand Header */}
      <div className="sidebar-brand" onClick={() => onSelectTab('dashboard')} role="button" tabIndex={0}>
        <div className="sidebar-brand-icon">
          <GraduationCapIcon size={22} />
        </div>
        <div className="sidebar-brand-text">
          <span className="brand-title-primary">Student Readiness</span>
          <span className="brand-title-secondary">Control Center</span>
        </div>
      </div>

      {/* Main Navigation Menu */}
      <nav className="sidebar-nav">
        <div className="sidebar-nav-section-title">Main Menu</div>
        <ul className="sidebar-nav-list">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <li key={item.id} className="sidebar-nav-item">
                <button
                  type="button"
                  className={`sidebar-nav-btn ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="sidebar-nav-icon">{item.icon}</span>
                  <span className="sidebar-nav-label">{item.label}</span>
                  {item.id === 'analytics' && <span className="sidebar-pill">24h</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom Motivational Support Card */}
      <div className="sidebar-footer">
        <div className="support-card">
          <div className="support-card-icon">
            <SeedlingIcon size={20} />
          </div>
          <div className="support-card-text">
            <strong>Empowering Students</strong>
            <p>For a brighter, competency-ready tomorrow.</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
