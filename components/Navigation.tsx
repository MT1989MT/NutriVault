
import React, { memo, useCallback } from 'react';
import { Utensils, Dumbbell, ChefHat, Calendar, User } from 'lucide-react';
import { t } from '../utils/i18n';

interface NavigationProps { currentView: string; onChange: (view: any) => void; }

const items = [
  { view: 'DASHBOARD', icon: Utensils, labelKey: 'food' as const },
  { view: 'WORKOUTS', icon: Dumbbell, labelKey: 'workout' as const },
  { view: 'RECIPES', icon: ChefHat, labelKey: 'recipes' as const },
  { view: 'HISTORY', icon: Calendar, labelKey: 'overview' as const },
  { view: 'PROFILE', icon: User, labelKey: 'profile' as const },
];

const Navigation: React.FC<NavigationProps> = memo(({ currentView, onChange }) => {
  const handleClick = useCallback((view: string) => {
    onChange(view);
  }, [onChange]);

  return (
    <div className="fixed bottom-0 left-0 right-0 glass-nav border-t border-gray-100/60 z-50">
      <div className="max-w-full mx-auto flex items-center justify-around px-3 h-[68px]">
        {items.map(({ view, icon: Icon, labelKey }) => (
          <button key={view} onClick={() => handleClick(view)} aria-label={t(labelKey)} aria-current={currentView === view ? 'page' : undefined} className="flex flex-col items-center justify-center min-w-[64px] min-h-[52px] py-1 px-2 transition-smooth active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2 rounded-xl">
            <div className={`p-2.5 rounded-2xl transition-smooth ${currentView === view ? 'bg-gradient-to-br from-[#E07A5F] to-[#C85A40] text-white shadow-md shadow-[#E07A5F]/25' : 'text-gray-400 hover:text-gray-500'}`}>
              <Icon className="w-[22px] h-[22px]" strokeWidth={currentView === view ? 2.5 : 1.8} />
            </div>
            <span className={`text-[11px] font-semibold mt-1 tracking-wide ${currentView === view ? 'text-[#E07A5F]' : 'text-gray-400'}`}>{t(labelKey)}</span>
          </button>
        ))}
      </div>
      <div style={{height: 'env(safe-area-inset-bottom, 0px)'}} />
    </div>
  );
});

Navigation.displayName = 'Navigation';
export default Navigation;
