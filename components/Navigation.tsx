
import React, { memo, useCallback } from 'react';
import { Utensils, Dumbbell, Calendar, User, Plus } from 'lucide-react';
import { t } from '../utils/i18n';

interface NavigationProps {
  currentView: string;
  onChange: (view: any) => void;
  onFab: () => void;
}

// Warm Terra tab bar: 4 tabs + center FAB. Recipes moved out of the bar and is
// reachable from the Food screen ("View all" / recipes card) and the FAB flow.
const left = [
  { view: 'DASHBOARD', icon: Utensils, labelKey: 'food' as const },
  { view: 'WORKOUTS', icon: Dumbbell, labelKey: 'workout' as const },
];
const right = [
  { view: 'HISTORY', icon: Calendar, labelKey: 'overview' as const },
  { view: 'PROFILE', icon: User, labelKey: 'profile' as const },
];

const NavButton: React.FC<{
  view: string; icon: any; label: string; active: boolean; onClick: () => void;
}> = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    aria-label={label}
    aria-current={active ? 'page' : undefined}
    className="flex flex-col items-center justify-center flex-1 min-h-[52px] py-1 transition-smooth active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2 rounded-xl"
  >
    <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.2 : 1.8} style={{ color: active ? 'var(--terra)' : 'var(--faint)' }} />
    <span className={`text-[10px] font-semibold mt-1 tracking-wide ${active ? 'text-[#E07A5F]' : 'text-[#B4A79C]'}`}>{label}</span>
  </button>
);

const Navigation: React.FC<NavigationProps> = memo(({ currentView, onChange, onFab }) => {
  const handleClick = useCallback((view: string) => { onChange(view); }, [onChange]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="bg-white nav-shadow rounded-t-[28px]">
        <div className="max-w-full mx-auto flex items-center px-4 h-[72px]">
          {left.map(({ view, icon, labelKey }) => (
            <NavButton key={view} view={view} icon={icon} label={t(labelKey)} active={currentView === view} onClick={() => handleClick(view)} />
          ))}
          {/* Center FAB — raised above the bar, opens the Add Food flow */}
          <div className="relative flex-1 flex justify-center">
            <button
              onClick={onFab}
              aria-label={t('addFood')}
              className="absolute -top-[54px] w-[58px] h-[58px] bg-[#E07A5F] rounded-full flex items-center justify-center terra-shadow-lg active:scale-90 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2"
            >
              <Plus className="w-[26px] h-[26px] text-white" strokeWidth={2.4} />
            </button>
          </div>
          {right.map(({ view, icon, labelKey }) => (
            <NavButton key={view} view={view} icon={icon} label={t(labelKey)} active={currentView === view} onClick={() => handleClick(view)} />
          ))}
        </div>
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>
  );
});

Navigation.displayName = 'Navigation';
export default Navigation;
