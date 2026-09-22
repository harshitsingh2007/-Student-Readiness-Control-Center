/**
 * Login Page Component
 * 
 * WHAT: Clean, beginner-friendly authentication page with preset demo logins.
 */

import React, { useState } from 'react';
import { AuthResponse } from '../types/api';
import { apiClient, ApiError } from '../services/api';

interface LoginProps {
  onLoginSuccess: (authData: AuthResponse) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Password123!');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (loginEmail: string, loginPass: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiClient<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });
      localStorage.setItem('srcc_auth_token', res.token);
      onLoginSuccess(res);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to connect to backend server on port 5002.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin(email, password);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">🎓</div>
          <h1>Student Readiness Control Center</h1>
          <p className="login-subtext">Enterprise Multi-Tenant Assessment & Verification Platform</p>
        </div>

        {errorMessage && (
          <div className="login-error" role="alert">
            ⚠️ {errorMessage}
          </div>
        )}

        <form onSubmit={onSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="evaluator@alpha.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className="btn-primary btn-block"
            disabled={isLoading || !email}
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="demo-accounts-section">
          <h3>Quick Demo Logins</h3>
          <p className="demo-hint">Click any role to log in instantly (Password: <code>Password123!</code>)</p>

          <div className="demo-buttons-grid">
            <button
              type="button"
              className="btn-demo-account"
              onClick={() => handleLogin('evaluator@alpha.com', 'Password123!')}
              disabled={isLoading}
            >
              <span className="demo-tenant">Tenant Alpha</span>
              <strong>Alpha Evaluator</strong>
              <small>evaluator@alpha.com</small>
            </button>

            <button
              type="button"
              className="btn-demo-account"
              onClick={() => handleLogin('admin@alpha.com', 'Password123!')}
              disabled={isLoading}
            >
              <span className="demo-tenant">Tenant Alpha</span>
              <strong>Alpha Admin</strong>
              <small>admin@alpha.com</small>
            </button>

            <button
              type="button"
              className="btn-demo-account"
              onClick={() => handleLogin('evaluator@beta.com', 'Password123!')}
              disabled={isLoading}
            >
              <span className="demo-tenant">Tenant Beta</span>
              <strong>Beta Evaluator</strong>
              <small>evaluator@beta.com</small>
            </button>

            <button
              type="button"
              className="btn-demo-account"
              onClick={() => handleLogin('admin@beta.com', 'Password123!')}
              disabled={isLoading}
            >
              <span className="demo-tenant">Tenant Beta</span>
              <strong>Beta Admin</strong>
              <small>admin@beta.com</small>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
