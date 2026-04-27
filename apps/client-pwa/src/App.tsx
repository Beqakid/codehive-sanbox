import React, { Suspense, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { ThemeProvider } from '@pcs/ui/theme';
import { CssBaseline, Spinner } from '@pcs/ui';
import { AuthProvider, useAuth } from '@pcs/auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Lazy-loaded Route Components
const Landing = React.lazy(() => import('./pages/Landing'));
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Bookings = React.lazy(() => import('./pages/Bookings'));
const BookingCreate = React.lazy(() => import('./pages/BookingCreate'));
const BookingHistory = React.lazy(() => import('./pages/BookingHistory'));
const CaregiverSearch = React.lazy(() => import('./pages/CaregiverSearch'));
const CaregiverDetail = React.lazy(() => import('./pages/CaregiverDetail'));
const NotFound = React.lazy(() => import('./pages/NotFound'));
const ReviewForm = React.lazy(() => import('./pages/ReviewForm'));

const queryClient = new QueryClient();

function AuthenticatedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 48 }}>
        <Spinner />
      </div>
    );
  }
  return status === 'authenticated' ? <>{children}</> : <Navigate to="/login" replace />;
}

function UnauthenticatedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 48 }}>
        <Spinner />
      </div>
    );
  }
  return status !== 'authenticated' ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

// PWA Installation/Prompt logic (optional enhancement)
function usePwaInstallPrompt() {
  useEffect(() => {
    let deferredPrompt: any = null;
    function beforeInstallHandler(e: Event) {
      e.preventDefault();
      deferredPrompt = e;
      // Optionally: show custom install banner here
    }
    window.addEventListener('beforeinstallprompt', beforeInstallHandler as any);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler as any);
    };
  }, []);
}

export default function App() {
  usePwaInstallPrompt();

  return (
    <ThemeProvider>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Router>
            <Suspense fallback={
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 48 }}>
                <Spinner />
              </div>
            }>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route
                  path="/login"
                  element={
                    <UnauthenticatedRoute>
                      <Login />
                    </UnauthenticatedRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <UnauthenticatedRoute>
                      <Register />
                    </UnauthenticatedRoute>
                  }
                />

                <Route
                  path="/dashboard"
                  element={
                    <AuthenticatedRoute>
                      <Dashboard />
                    </AuthenticatedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <AuthenticatedRoute>
                      <Profile />
                    </AuthenticatedRoute>
                  }
                />
                <Route
                  path="/bookings"
                  element={
                    <AuthenticatedRoute>
                      <Bookings />
                    </AuthenticatedRoute>
                  }
                >
                  <Route path="new" element={<BookingCreate />} />
                  <Route path="history" element={<BookingHistory />} />
                </Route>
                <Route
                  path="/caregivers"
                  element={
                    <AuthenticatedRoute>
                      <CaregiverSearch />
                    </AuthenticatedRoute>
                  }
                />
                <Route
                  path="/caregivers/:id"
                  element={
                    <AuthenticatedRoute>
                      <CaregiverDetail />
                    </AuthenticatedRoute>
                  }
                >
                  <Route path="review" element={<ReviewForm />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </Router>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}