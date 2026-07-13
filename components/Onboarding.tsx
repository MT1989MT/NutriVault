import React, { useState } from 'react';
import { ChevronRight, Shield, Utensils, Dumbbell } from 'lucide-react';

interface OnboardingProps {
  onComplete: () => void;
}

const ONBOARDING_KEY = 'nutrivault_onboarding_complete';

export const hasSeenOnboarding = (): boolean => {
  return localStorage.getItem(ONBOARDING_KEY) === 'true';
};

export const markOnboardingComplete = (): void => {
  localStorage.setItem(ONBOARDING_KEY, 'true');
};

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [currentScreen, setCurrentScreen] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const totalSlides = 4; // 1 brand + 3 onboarding

  const handleComplete = () => {
    markOnboardingComplete();
    onComplete();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;

    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentScreen < totalSlides - 1) {
        setCurrentScreen(currentScreen + 1);
      } else if (diff < 0 && currentScreen > 0) {
        setCurrentScreen(currentScreen - 1);
      }
    }
    setTouchStart(null);
  };

  const nextScreen = () => {
    if (currentScreen < totalSlides - 1) {
      setCurrentScreen(currentScreen + 1);
    }
  };

  // Slide 0 = branded welcome, slides 1-3 = onboarding content
  const contentSlides = [
    {
      icon: <Shield className="w-8 h-8 text-[#6B6257]" />,
      title: 'Your data stays private.',
      subtitle: 'Everything is stored locally on your phone. No account needed, no email, no tracking.',
      example: 'Privacy by default. Your health data is yours and yours only.',
      color: 'from-gray-700/10 to-gray-700/5'
    },
    {
      icon: <Utensils className="w-8 h-8 text-[#E07A5F]" />,
      title: 'Log food in seconds.',
      subtitle: 'Just type what you ate in your own words. Calories and macros are calculated instantly.',
      example: '"2 eggs with toast" or "chicken salad with rice". Simple as that.',
      color: 'from-[#E07A5F]/10 to-[#E07A5F]/5'
    },
    {
      icon: <Dumbbell className="w-8 h-8 text-[#3D5A48]" />,
      title: 'Track everything.',
      subtitle: 'Meals, weight, workouts and recipes in one place. Stay on top of your goals with ease.',
      example: 'Affordable and complete. Everything you need to stay healthy.',
      color: 'from-[#EFF2EE] to-[#EFF2EE]'
    }
  ];

  return (
    <div
      className="fixed inset-0 flex flex-col bg-[#FAF6F1]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Skip button */}
      <div className="flex justify-end px-6 pt-4">
        <button
          onClick={handleComplete}
          className="text-[#9A8B80] text-sm font-medium px-3 py-1"
        >
          Skip
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {currentScreen === 0 ? (
          /* ===== BRANDED WELCOME SCREEN ===== */
          <div className="text-center animate-fadeIn w-full max-w-sm" key="welcome">
            {/* App icon */}
            <div className="w-20 h-20 bg-[#E07A5F] rounded-[22px] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#E07A5F]/25">
              <span className="text-white text-3xl font-black font-display">N</span>
            </div>

            {/* Brand name */}
            <h1 className="text-[36px] font-black tracking-tight font-display leading-none mb-2">
              <span className="text-[#2B2523]">Nutri</span><span className="text-[#E07A5F]">Vault</span>
            </h1>

            {/* Tagline */}
            <p className="text-[17px] text-[#9A8B80] font-medium leading-relaxed">
              Your Private Nutrition Coach
            </p>

            {/* Subtle separator */}
            <div className="w-12 h-0.5 bg-[#E07A5F]/20 rounded-full mx-auto mt-6 mb-6" />

            {/* Sub-message */}
            <div className="bg-white rounded-2xl p-4 card-shadow mx-auto">
              <p className="text-[14px] text-[#9A8B80] leading-relaxed">
                Simple, private, and affordable nutrition tracking. Built for people who want to live healthier.
              </p>
            </div>
          </div>
        ) : (
          /* ===== ONBOARDING CONTENT SLIDES ===== */
          <div className="text-center animate-fadeIn w-full max-w-sm" key={currentScreen}>
            {(() => {
              const slide = contentSlides[currentScreen - 1];
              return (
                <>
                  {/* Icon */}
                  <div className={`w-14 h-14 bg-gradient-to-br ${slide.color} rounded-2xl flex items-center justify-center mx-auto mb-5`}>
                    {slide.icon}
                  </div>

                  <h1 className="text-[24px] font-black text-[#2B2523] mb-2 font-display tracking-tight leading-tight">
                    {slide.title}
                  </h1>
                  <p className="text-[15px] text-[#9A8B80] leading-relaxed mb-5">
                    {slide.subtitle}
                  </p>

                  {/* Example card */}
                  <div className="bg-white rounded-2xl p-3.5 card-shadow mx-auto">
                    <p className="text-[13px] text-[#6B6257] leading-relaxed">
                      {slide.example}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Bottom bar with button and dots */}
      <div className="px-6 pb-8 pt-4" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        {/* Dot indicators */}
        <div className="flex justify-center gap-2 mb-6">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentScreen(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentScreen === i ? 'bg-[#E07A5F] w-7' : 'bg-[#E8DFD5] w-1.5'
              }`}
            />
          ))}
        </div>

        {/* Button */}
        <button
          onClick={currentScreen === totalSlides - 1 ? handleComplete : nextScreen}
          className="w-full bg-[#E07A5F] text-white py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-smooth shadow-lg shadow-[#E07A5F]/25"
        >
          {currentScreen === 0 ? "Let's Go" : currentScreen === totalSlides - 1 ? 'Get Started' : 'Next'}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default Onboarding;
