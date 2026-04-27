'use client';

import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import React from 'react';

const PUBLIC_ROUTES = [
  '/',
  '/sign-in',
  '/sign-up',
  '/sign-in/(.*)',
  '/sign-up/(.*)',
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => {
    if (route.includes('(.*)')) {
      const base = route.replace('/(.*)', '');
      return pathname === base || pathname.startsWith(`${base}/`);
    }
    return pathname === route;
  });
}

interface RouteGuardProps {
  children: React.ReactNode;
}

function RouteGuard({ children }: RouteGuardProps): React.ReactElement {
  const pathname = usePathname();
  const isPublic = isPublicRoute(pathname ?? '/');

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn redirectUrl={pathname ?? '/'} />
      </SignedOut>
    </>
  );
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#2563eb',
          colorBackground: '#ffffff',
          colorText: '#1e293b',
          colorInputBackground: '#f8fafc',
          colorInputText: '#1e293b',
          borderRadius: '0.5rem',
        },
        elements: {
          formButtonPrimary:
            'bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors',
          card: 'shadow-lg border border-slate-200',
          headerTitle: 'text-slate-900 font-semibold',
          headerSubtitle: 'text-slate-600',
          socialButtonsBlockButton:
            'border border-slate-200 hover:bg-slate-50 transition-colors',
          formFieldLabel: 'text-slate-700 font-medium',
          formFieldInput:
            'border-slate-300 focus:border-blue-500 focus:ring-blue-500',
          footerActionLink: 'text-blue-600 hover:text-blue-700 font-medium',
          identityPreviewEditButton: 'text-blue-600 hover:text-blue-700',
          userButtonAvatarBox: 'w-8 h-8',
          userButtonPopoverCard: 'shadow-lg border border-slate-200',
          userButtonPopoverActionButton:
            'hover:bg-slate-50 text-slate-700 transition-colors',
        },
      }}
    >
      <RouteGuard>{children}</RouteGuard>
    </ClerkProvider>
  );
}

export default AuthProvider;