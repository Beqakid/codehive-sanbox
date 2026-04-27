import React, { useState, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { Button, Input, Card, Spinner, Alert } from '@pcs/ui';
import { clientLogin } from '../services/auth';
import { useUser } from '../hooks/useUser';

const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password required.' }),
});

type LoginForm = z.infer<typeof loginSchema>;

const initialForm: LoginForm = {
  email: '',
  password: '',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: userLoading, refresh } = useUser();
  const [form, setForm] = useState<LoginForm>(initialForm);
  const [formError, setFormError] = useState<{ email?: string; password?: string }>(
    {}
  );
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Redirect already-logged-in users to the dashboard
  React.useEffect(() => {
    if (user && !userLoading) {
      navigate('/dashboard', { replace: true });
    }
    // eslint-disable-next-line
  }, [user, userLoading]);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({
        ...f,
        [e.target.name]: e.target.value,
      }));
      setFormError({});
      setGlobalError(null);
    },
    []
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setPending(true);
      setFormError({});
      setGlobalError(null);

      const validation = loginSchema.safeParse(form);
      if (!validation.success) {
        const fieldErrors = validation.error.flatten().fieldErrors;
        setFormError({
          email: fieldErrors.email?.[0],
          password: fieldErrors.password?.[0],
        });
        setPending(false);
        return;
      }

      try {
        const resp = await clientLogin({
          email: form.email,
          password: form.password,
        });
        if (resp.success) {
          await refresh();
          // Redirect to previously intended page if present, else dashboard
          let dest = '/dashboard';
          if (location.state && typeof location.state === 'object' && (location.state as any).from) {
            dest = (location.state as any).from;
          }
          navigate(dest, { replace: true });
        } else {
          setGlobalError(resp.message ?? 'Login failed. Please try again.');
        }
      } catch (err) {
        setGlobalError('Something went wrong. Please try again.');
      } finally {
        setPending(false);
      }
    },
    [form, navigate, location.state, refresh]
  );

  return (
    <div className="flex min-h-screen bg-neutral-50 items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold mb-2">Sign in to PCS Client</h1>
        <p className="mb-4 text-sm text-neutral-500">
          Welcome back! Enter your email and password to continue.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-neutral-700 mb-1">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={onInputChange}
              disabled={pending}
              required
            />
            {formError.email && (
              <div className="mt-1 text-xs text-red-600">{formError.email}</div>
            )}
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-neutral-700 mb-1">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={onInputChange}
              disabled={pending}
              required
            />
            {formError.password && (
              <div className="mt-1 text-xs text-red-600">{formError.password}</div>
            )}
          </div>

          {globalError && <Alert type="error" className="mb-2">{globalError}</Alert>}

          <Button
            type="submit"
            color="primary"
            className="w-full mt-2"
            disabled={pending}
          >
            {pending ? <Spinner size="sm" /> : 'Sign In'}
          </Button>
        </form>
        <div className="flex justify-between mt-6 text-sm text-neutral-500">
          <Link to="/register" className="hover:underline">
            Create an account
          </Link>
          <Link to="/forgot-password" className="hover:underline">
            Forgot password?
          </Link>
        </div>
      </Card>
      <div className="absolute bottom-4 w-full flex justify-center text-xs text-neutral-400">
        &copy; {new Date().getFullYear()} PCS Caregiver Marketplace
      </div>
    </div>
  );
}