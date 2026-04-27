import React from "react";
import { useCallback } from "react";

// Example imports from packages/ui (assume these exist or are stubbed)
import { Button } from "@pcs/ui/Button";
import { Container } from "@pcs/ui/Container";
import { Card } from "@pcs/ui/Card";
import { Logo } from "@pcs/ui/Logo";

// URLs for registration - update with actual routes as PWAs are fleshed out
const CLIENT_PWA_URL = "/client";
const CAREGIVER_PWA_URL = "/caregiver";

const features = [
  {
    icon: (
      <svg width="32" height="32" fill="none" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="16" fill="#FDE68A" />
        <path
          d="M10 18.5V14c0-3 2.5-5.5 5.5-5.5S21 11 21 14v4.5M16 23v-3M12.5 22h7"
          stroke="#B45309"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
    title: "Trusted Caregivers",
    description:
      "All caregivers are background checked and vetted for safety and professionalism.",
  },
  {
    icon: (
      <svg width="32" height="32" fill="none" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="16" fill="#BFDBFE" />
        <rect
          x="10"
          y="13"
          width="12"
          height="8"
          rx="2"
          stroke="#1D4ED8"
          strokeWidth="2"
        />
        <path
          d="M16 13V11"
          stroke="#1D4ED8"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
    title: "Book Instantly",
    description:
      "Search by location, availability, and expertise. Book the right caregiver on your schedule.",
  },
  {
    icon: (
      <svg width="32" height="32" fill="none" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="16" fill="#C7F9CC" />
        <path
          d="M11 17.5l3.5 3 6-7"
          stroke="#15803D"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
    title: "Personalized Matches",
    description:
      "Advanced filters help you find caregivers with the skills and experience you need.",
  },
];

function Header() {
  return (
    <header className="w-full bg-white border-b border-gray-100">
      <Container className="flex items-center justify-between py-4">
        <a href="/" aria-label="PCS Home">
          <Logo width={36} height={36} />
        </a>
        <nav className="flex gap-4 items-center">
          <a
            href="#features"
            className="text-gray-600 text-sm font-medium hover:text-primary"
          >
            Features
          </a>
          <a
            href="#signup"
            className="text-gray-600 text-sm font-medium hover:text-primary"
          >
            Get Started
          </a>
        </nav>
      </Container>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-blue-50 via-white to-green-50 pb-12 pt-16">
      <Container className="flex flex-col-reverse md:flex-row items-center gap-10">
        <div className="flex-1 flex flex-col items-start">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6 tracking-tight max-w-2xl">
            Find & Book <br />
            <span className="text-primary">Trusted Caregivers</span> <br />
            Near You
          </h1>
          <p className="text-lg text-gray-700 mb-8 max-w-xl">
            PCS is the modern, mobile-friendly marketplace for connecting families with qualified, compassionate caregivers. Easily browse, book, and manage care all in one place.
          </p>
          <div className="flex gap-4" id="signup">
            <Button
              as="a"
              href={CLIENT_PWA_URL}
              color="primary"
              size="lg"
              className="font-semibold"
            >
              I Need Care
            </Button>
            <Button
              as="a"
              href={CAREGIVER_PWA_URL}
              color="secondary"
              size="lg"
              className="font-semibold"
            >
              I’m a Caregiver
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center mb-10 md:mb-0">
          <img
            src="/landing/hero-caregiver.svg"
            srcSet="/landing/hero-caregiver.svg 1x, /landing/hero-caregiver@2x.svg 2x"
            alt="Caregiver with client illustration"
            className="max-w-full w-[400px] h-auto drop-shadow-lg"
            loading="eager"
          />
        </div>
      </Container>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="py-16 bg-white">
      <Container>
        <h2 className="text-center text-3xl font-bold text-gray-900 mb-6">
          Why Choose PCS?
        </h2>
        <p className="text-center text-gray-600 mb-12 max-w-xl mx-auto">
          Unlike agencies and generic gig apps, PCS empowers you by letting you choose professional caregivers with the experience and availability you need—no middlemen, no hidden fees.
        </p>
        <div className="flex flex-col md:flex-row justify-center gap-8">
          {features.map((f, i) => (
            <Card
              key={f.title}
              className="flex-1 flex flex-col items-center text-center p-8 shadow-none border border-gray-100 rounded-xl hover:shadow-lg transition group"
            >
              <div className="mb-4">{f.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {f.title}
              </h3>
              <p className="text-gray-600">{f.description}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

function CallToAction() {
  return (
    <section className="py-16 bg-gradient-to-r from-blue-100 via-white to-green-100">
      <Container className="flex flex-col items-center gap-4">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-4">
          Ready to get started?
        </h2>
        <p className="text-gray-700 text-center mb-6 max-w-md">
          Whether you need care for your loved ones or want to help others as a professional caregiver, PCS has you covered. Sign up today!
        </p>
        <div className="flex gap-4">
          <Button
            as="a"
            href={CLIENT_PWA_URL}
            color="primary"
            size="lg"
            className="font-semibold"
          >
            Join as Client
          </Button>
          <Button
            as="a"
            href={CAREGIVER_PWA_URL}
            color="secondary"
            size="lg"
            className="font-semibold"
          >
            Join as Caregiver
          </Button>
        </div>
      </Container>
    </section>
  );
}

function Footer() {
  return (
    <footer className="w-full bg-white border-t border-gray-100 mt-8">
      <Container className="py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Logo width={24} height={24} />
          <span>PCS © {new Date().getFullYear()}</span>
        </div>
        <nav className="flex gap-4 items-center text-gray-400 text-sm">
          <a
            href="/privacy"
            className="hover:text-gray-600"
            rel="noopener"
          >
            Privacy
          </a>
          <a
            href="/terms"
            className="hover:text-gray-600"
            rel="noopener"
          >
            Terms
          </a>
          <a
            href="mailto:hello@pcs.app"
            className="hover:text-gray-600"
          >
            Contact
          </a>
        </nav>
      </Container>
    </footer>
  );
}

const App: React.FC = () => {
  // Scroll to features section if hash is present in URL
  React.useEffect(() => {
    if (window.location.hash === "#features") {
      const el = document.getElementById("features");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
    if (window.location.hash === "#signup") {
      const el = document.getElementById("signup");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, []);

  return (
    <div className="bg-white min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col">
        <Hero />
        <Features />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
};

export default App;