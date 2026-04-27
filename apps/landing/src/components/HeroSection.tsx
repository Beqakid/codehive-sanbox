import React from 'react';

type CTAButtonProps = {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  href: string;
  primary?: boolean;
};

const CTAButton: React.FC<CTAButtonProps> = ({ children, onClick, href, primary }) => (
  <a
    href={href}
    onClick={onClick}
    className={`inline-block px-6 py-3 rounded-lg font-semibold transition ${
      primary
        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
        : 'bg-white text-blue-600 border border-blue-600 hover:bg-blue-50'
    }`}
  >
    {children}
  </a>
);

const HeroSection: React.FC = () => {
  return (
    <section className="w-full bg-gradient-to-b from-blue-50 to-white pb-16 pt-20 md:pt-28">
      <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center gap-12">
        {/* Left: Value Proposition */}
        <div className="flex-1 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Find trusted caregivers.<br className="hidden md:inline" />
            <span className="text-blue-600">Book care with confidence.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-xl">
            PCS is a modern marketplace connecting families with qualified, compassionate caregivers—empowering independent living, peace of mind, and better outcomes.
          </p>
          <div className="flex flex-col md:flex-row gap-4 justify-center md:justify-start">
            <CTAButton href="/client/signup" primary>
              Find a Caregiver
            </CTAButton>
            <CTAButton href="/caregiver/signup">
              Become a Caregiver
            </CTAButton>
          </div>
        </div>
        {/* Right: Illustration / Visual */}
        <div className="flex-1 flex justify-center md:justify-end">
          <img
            src="/illustrations/hero-caregiver.svg"
            alt="Caregiver helping client"
            className="w-[340px] h-auto max-w-full drop-shadow-xl"
            loading="eager"
            draggable={false}
          />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;