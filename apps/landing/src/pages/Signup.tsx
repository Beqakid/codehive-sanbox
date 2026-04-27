import React from 'react';
import { Link } from 'react-router-dom';

const HERO_BG =
  'linear-gradient(120deg, rgba(44, 62, 80,0.93) 0%, rgba(31, 97, 141,0.93) 100%)';

const CLIENT_PWA_URL = '/client'; // update to actual deployed client PWA path
const CAREGIVER_PWA_URL = '/caregiver'; // update to actual deployed caregiver PWA path

export default function Signup() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <section
        className="flex-1 flex flex-col items-center justify-center px-4 py-12"
        style={{
          background: HERO_BG,
          color: 'white',
        }}
      >
        <div className="w-full max-w-md bg-white bg-opacity-90 rounded-xl shadow-xl p-8 flex flex-col items-center">
          <img
            src="/logo.svg"
            alt="PCS App Logo"
            className="h-12 mb-6"
            draggable={false}
          />
          <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
            Sign up for PCS
          </h1>
          <p className="text-center text-gray-700 mb-8">
            Get started by choosing your role:
          </p>
          <div className="w-full flex flex-col gap-6">
            <RoleCard
              title="I need a Caregiver"
              description="Find, book, and review trusted caregivers on our client app."
              cta="Continue as Client"
              to={CLIENT_PWA_URL}
              testId="cta-client"
              icon={
                <svg
                  className="w-8 h-8 text-sky-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m6-8a4 4 0 11-8 0 4 4 0 018 0zm6 4v6M16 7h.01"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            />
            <RoleCard
              title="I am a Caregiver"
              description="Sign up to offer your services and manage your profile."
              cta="Continue as Caregiver"
              to={CAREGIVER_PWA_URL}
              testId="cta-caregiver"
              icon={
                <svg
                  className="w-8 h-8 text-emerald-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M13.5 7.5a2 2 0 104 0 2 2 0 00-4 0zm-6 0a2 2 0 104 0 2 2 0 00-4 0zM20 21v-2a4 4 0 00-3-3.87M4 21v-2a4 4 0 013-3.87M12 7.5v.01"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            />
          </div>
        </div>
        <div className="mt-10 text-white text-sm opacity-70">
          <Link to="/" className="hover:underline mr-4">
            Back to home
          </Link>
          <span>PCS App &copy; {new Date().getFullYear()}</span>
        </div>
      </section>
    </main>
  );
}

type RoleCardProps = {
  title: string;
  description: string;
  cta: string;
  to: string;
  icon: React.ReactNode;
  testId?: string;
};

function RoleCard({ title, description, cta, to, icon, testId }: RoleCardProps) {
  return (
    <div className="flex flex-col items-center bg-slate-100 border border-slate-200 rounded-lg shadow-sm px-6 py-5">
      <div className="mb-2">{icon}</div>
      <h2 className="font-semibold text-lg text-slate-900 mb-1">{title}</h2>
      <p className="mb-4 text-slate-700 text-sm text-center leading-snug">
        {description}
      </p>
      <a
        href={to}
        data-testid={testId}
        className="w-full inline-block bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-md text-base py-2 transition-colors text-center active:scale-95"
      >
        {cta}
      </a>
    </div>
  );
}