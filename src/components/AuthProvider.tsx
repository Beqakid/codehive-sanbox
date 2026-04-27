'use client';

import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import React from 'react';

const PUBLIC_ROUTES = [
  '/',
  '/sign-in',
  '/sign-up',
  '/sign-in/sso-callback',
  '/sign-up/sso-callback',
];

interface AuthProviderProps {
  children: React.ReactNode;
}

function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  if (isPublicRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn redirectUrl={pathname} />
      </SignedOut>
    </>
  );
}

export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#2563eb',
          colorBackground: '#ffffff',
          colorText: '#111827',
          colorInputBackground: '#f9fafb',
          colorInputText: '#111827',
          borderRadius: '0.5rem',
        },
        elements: {
          formButtonPrimary:
            'bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors',
          card: 'shadow-lg border border-gray-200 rounded-xl',
          headerTitle: 'text-2xl font-bold text-gray-900',
          headerSubtitle: 'text-gray-500',
          socialButtonsBlockButton:
            'border border-gray-300 hover:bg-gray-50 transition-colors rounded-lg',
          formFieldInput:
            'border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          footerActionLink: 'text-blue-600 hover:text-blue-700 font-medium',
        },
      }}
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
    >
      <RouteGuard>{children}</RouteGuard>
    </ClerkProvider>
  );
}

export default AuthProvider;