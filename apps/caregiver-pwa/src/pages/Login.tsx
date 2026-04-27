import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Input, Card, Spinner, Alert } from '@pcs/ui';
import { api } from '../utils/api';
import { getApiErrorMessage } from '../utils/errors';
import { setAuthToken } from '../utils/auth';

const Login: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For accessibility/password field "show" toggle
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/auth/login', {
        email,
        password,
        role: 'caregiver'
      });

      // Instruct to set the returned JWT cookie and store token if necessary
      if ('token' in res.data) {
        setAuthToken(res.data.token);
      }
      // Optionally, you may fetch profile here and save to context/state

      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 px-4">
      <Card className="w-full max-w-md py-8 px-6 shadow-lg">
        <div className="mb-6 text-center">
          <img
            src="/logo-caregiver.svg"
            alt="PCS Caregiver Logo"
            className="mx-auto mb-3 w-[54px] h-[54px]"
            draggable={false}
          />
          <h2 className="text-2xl font-semibold text-neutral-800 mb-1">Caregiver Login</h2>
          <p className="text-sm text-neutral-500">Welcome back! Sign in to manage your caregiver profile.</p>
        </div>
        <form onSubmit={handleSubmit} autoComplete="on" className="space-y-5">
          {error && <Alert type="error" className="mb-2">{error}</Alert>}

          <div>
            <label htmlFor="email" className="block mb-1 text-neutral-700 text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@email.com"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="password" className="block mb-1 text-neutral-700 text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={submitting}
                className="pr-10"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-neutral-400 hover:text-neutral-600 focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={submitting}
              >
                {showPassword ? (
                  <span role="img" aria-label="Hide">🙈</span>
                ) : (
                  <span role="img" aria-label="Show">👁️</span>
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full mt-2"
            disabled={submitting}
            size="lg"
          >
            {submitting ? <Spinner size="sm" aria-label="Logging in..." /> : 'Login'}
          </Button>
        </form>

        <div className="mt-6 flex flex-col gap-2 text-center text-sm">
          <Link
            to="/forgot-password"
            className="text-primary-600 hover:underline focus:outline-none"
          >
            Forgot password?
          </Link>
          <span className="text-neutral-500">
            New here?{' '}
            <Link to="/register" className="text-primary-600 hover:underline">
              Create a caregiver account
            </Link>
          </span>
        </div>
      </Card>

      <footer className="mt-10 text-xs text-neutral-400 text-center">
        &copy; {new Date().getFullYear()} PCS App. All rights reserved.
      </footer>
    </div>
  );
};

export default Login;