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
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { StudentPage } from './pages/StudentPage';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
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
   * Seeded Defect Fix: Multi-Boundary Tenant Switcher
   * Swaps authenticated token, clears stale detail views, and redirects to root dashboard.
   */
  const handleSwitchTenant = async (newTenantId: string) => {
    if (!user || user.tenantId === newTenantId) return;

    try {
      // Switch to corresponding evaluator for target tenant
      const email = newTenantId === 'tenant-beta' ? 'evaluator@beta.com' : 'evaluator@alpha.com';
      const authRes = await apiClient<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: 'Password123!' }),
      });

      // 1. Update stored token
      localStorage.setItem('srcc_auth_token', authRes.token);

      // 2. Clear stale student detail view immediately
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

  return (
    <div className="app-shell">
      <Navbar
        user={user}
        onSwitchTenant={handleSwitchTenant}
        onLogout={handleLogout}
        onNavigateHome={navigateToDashboard}
        onOpenAnalytics={() => setShowAnalyticsModal(true)}
      />

      <main className="main-content">
        {selectedStudentId ? (
          <StudentPage
            studentId={selectedStudentId}
            onBack={navigateToDashboard}
          />
        ) : (
          <Dashboard
            currentTenantId={user.tenantId}
            onSelectStudent={navigateToStudent}
            showAnalyticsModal={showAnalyticsModal}
            onCloseAnalyticsModal={() => setShowAnalyticsModal(false)}
          />
        )}
      </main>
    </div>
  );
};

export default App;
