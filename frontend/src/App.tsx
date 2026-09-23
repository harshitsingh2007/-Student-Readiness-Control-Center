/**
 * App Root Component
 * 
 * WHAT: Root state container managing authenticated context, tenant switching,
 *       and page navigation (Dashboard vs Student Detail).
 * WHY: Section 22 Seeded Defect Correction:
 *      When tenant switches:
 *      1. Aborts in-flight requests.
 *      2. Clears stale student detail.
 *      3. Resets relevant list state.
 *      4. Updates authentication token.
 *      5. Fetches new tenant's data.
 */

import React, { useState, useEffect } from 'react';
import { UserProfile, AuthResponse } from './types/api';
import { apiClient } from './services/api';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { StudentPage } from './pages/StudentPage';
import { AnalyticsView } from './pages/AnalyticsView';
import { AssessmentsView } from './pages/AssessmentsView';
import { ReportsView } from './pages/ReportsView';
import { OrganizationView } from './pages/OrganizationView';
import { SettingsView } from './pages/SettingsView';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<boolean>(false);

  // Check existing session on load
  useEffect(() => {
    const token = localStorage.getItem('srcc_auth_token');
    if (token) {
      apiClient<{ user: UserProfile }>('/auth/me')
        .then((res) => {
          setUser(res.user);
        })
        .catch(() => {
          localStorage.removeItem('srcc_auth_token');
          setUser(null);
        })
        .finally(() => setIsInitializing(false));
    } else {
      setIsInitializing(false);
    }
  }, []);

  // Listen to popstate for browser back/forward buttons
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      const match = path.match(/\/students\/([^/?#]+)/);
      if (match) {
        setSelectedStudentId(match[1]);
      } else {
        setSelectedStudentId(null);
      }
    };

    handleLocationChange();
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const handleLoginSuccess = (authData: AuthResponse) => {
    setUser(authData.user);
    setSelectedStudentId(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('srcc_auth_token');
    setUser(null);
    setSelectedStudentId(null);
  };

  /**
   * Multi-Boundary Tenant Switcher
   * Swaps authenticated token via secure server-side endpoint, clears stale detail views,
   * resets URL path, and updates active user context.
   */
  const handleSwitchTenant = async (newTenantId: string) => {
    if (!user || user.tenantId === newTenantId) return;

    try {
      const authRes = await apiClient<AuthResponse>('/auth/switch-tenant', {
        method: 'POST',
        body: JSON.stringify({ targetTenantId: newTenantId }),
      });

      // 1. Update stored token
      localStorage.setItem('srcc_auth_token', authRes.token);

      // 2. Clear stale student detail view immediately and reset URL
      setSelectedStudentId(null);
      window.history.pushState({}, '', '/');

      // 3. Update active user context (triggers hook aborts & list resets)
      setUser(authRes.user);
    } catch (err: any) {
      alert(`Could not switch tenant: ${err.message}`);
    }
  };

  const navigateToStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    window.history.pushState({}, '', `/students/${studentId}`);
  };

  const navigateToDashboard = () => {
    setSelectedStudentId(null);
    window.history.pushState({}, '', '/');
  };

  if (isInitializing) {
    return (
      <div className="init-screen">
        <div className="spinner" />
        <p>Connecting to Student Readiness Control Center...</p>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            currentTenantId={user.tenantId}
            onSelectStudent={navigateToStudent}
            showAnalyticsModal={showAnalyticsModal}
            onCloseAnalyticsModal={() => setShowAnalyticsModal(false)}
            viewMode="dashboard"
          />
        );
      case 'students':
        return (
          <Dashboard
            currentTenantId={user.tenantId}
            onSelectStudent={navigateToStudent}
            showAnalyticsModal={showAnalyticsModal}
            onCloseAnalyticsModal={() => setShowAnalyticsModal(false)}
            viewMode="students"
          />
        );
      case 'analytics':
        return <AnalyticsView currentTenantId={user.tenantId} />;
      case 'assessments':
        return (
          <AssessmentsView
            onNavigateToStudents={() => {
              setActiveTab('students');
              setSelectedStudentId(null);
              window.history.pushState({}, '', '/');
            }}
          />
        );
      case 'reports':
        return <ReportsView currentTenantId={user.tenantId} />;
      case 'organization':
        return (
          <OrganizationView
            user={user}
            onSwitchTenant={handleSwitchTenant}
          />
        );
      case 'settings':
        return (
          <SettingsView
            user={user}
            onLogout={handleLogout}
          />
        );
      default:
        return (
          <Dashboard
            currentTenantId={user.tenantId}
            onSelectStudent={navigateToStudent}
            showAnalyticsModal={showAnalyticsModal}
            onCloseAnalyticsModal={() => setShowAnalyticsModal(false)}
            viewMode="dashboard"
          />
        );
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setSelectedStudentId(null);
          window.history.pushState({}, '', '/');
        }}
        onOpenAnalytics={() => {
          setActiveTab('analytics');
          setSelectedStudentId(null);
          window.history.pushState({}, '', '/');
        }}
      />

      <div className="app-main-area">
        <Navbar
          user={user}
          onSwitchTenant={handleSwitchTenant}
          onLogout={handleLogout}
          onNavigateHome={() => {
            setActiveTab('dashboard');
            navigateToDashboard();
          }}
          onOpenAnalytics={() => {
            setActiveTab('analytics');
            setSelectedStudentId(null);
            window.history.pushState({}, '', '/');
          }}
        />

        <main className="main-content">
          {selectedStudentId ? (
            <StudentPage
              studentId={selectedStudentId}
              onBack={navigateToDashboard}
            />
          ) : (
            renderTabContent()
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
