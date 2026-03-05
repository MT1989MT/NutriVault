import React, { useState, useEffect } from 'react';
import { FoodItem, UserProfile, WorkoutLog } from './types';
import { getProfile, saveProfile, getLogs, addFoodsToLog, removeFoodFromLog, addWorkoutToLog, updateWaterIntake } from './services/storage';
import { getSession } from './services/auth';
import { initializePurchases } from './services/payments';
import ErrorBoundary from './components/ErrorBoundary';
import Profile from './components/Profile';
import Dashboard from './components/Dashboard';
import Recipes from './components/Recipes';
import Motivation from './components/Motivation';
import Workouts from './components/Workouts';
import History from './components/History';
import Navigation from './components/Navigation';
import Settings from './components/Settings';
import AuthScreen from './components/AuthScreen';
import Onboarding, { hasSeenOnboarding } from './components/Onboarding';
import CoachBanner from './components/CoachBanner';

type View = 'DASHBOARD' | 'RECIPES' | 'MOTIVATION' | 'PROFILE' | 'WORKOUTS' | 'HISTORY' | 'SETTINGS' | 'COACH';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<Record<string, import('./types').DayLog>>({});
  const [currentView, setCurrentView] = useState<View>('DASHBOARD');
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Initialize RevenueCat for in-app purchases
    initializePurchases();

    // Check if onboarding should be shown
    if (!hasSeenOnboarding()) {
      setShowOnboarding(true);
    }

    const session = getSession();
    if (session) {
      setIsAuthenticated(true);
      try { setProfile(getProfile()); } catch {}
      try { setLogs(getLogs()); } catch {}
    }
    setIsLoading(false);
  }, []);

  const handleSaveProfile = (newProfile: UserProfile) => {
    saveProfile(newProfile); setProfile(newProfile); setCurrentView('DASHBOARD');
  };
  const handleAddItems = (items: FoodItem[], date?: string) => {
    const targetDate = date || new Date().toISOString().split('T')[0];
    addFoodsToLog(targetDate, items);
    setLogs(getLogs());
  };
  const handleRemoveItem = (item: FoodItem, date?: string) => {
    const targetDate = date || new Date().toISOString().split('T')[0];
    removeFoodFromLog(targetDate, item.id);
    setLogs(getLogs());
  };
  const handleAddWorkout = (date: string, workout: WorkoutLog) => {
    addWorkoutToLog(date, workout);
    setLogs(getLogs());
  };
  const handleWaterUpdate = (date: string, ml: number) => {
    updateWaterIntake(date, ml);
    setLogs(getLogs());
  };

  if (isLoading) return <div className="h-full w-full bg-[#FAFAF8] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#E07A5F]"></div></div>;
  if (showOnboarding) return <Onboarding onComplete={() => setShowOnboarding(false)} />;
  if (!isAuthenticated) return <AuthScreen onAuthenticated={() => { setIsAuthenticated(true); setProfile(getProfile()); }} />;
  if (!profile) return <div className="h-full w-full bg-[#FAFAF8]"><Profile existingProfile={null} onSave={handleSaveProfile} /></div>;

  return (
    <ErrorBoundary>
      <div className="h-full w-full bg-[#FAFAF8] text-slate-900 font-sans overflow-hidden">
        <div className="mx-auto max-w-lg h-full relative bg-[#FAFAF8] flex flex-col">
          <div className="flex-1 overflow-hidden relative">
            {currentView === 'DASHBOARD' && (
              <div className="absolute inset-0 z-10">
                <Dashboard profile={profile} logs={logs} onItemsAdded={handleAddItems} onRemoveItem={handleRemoveItem} onWaterUpdate={handleWaterUpdate} onSettingsClick={() => setCurrentView('SETTINGS')} isActive={currentView === 'DASHBOARD'} />
              </div>
            )}
            {currentView === 'WORKOUTS' && (
              <div className="absolute inset-0 z-10">
                <Workouts logs={logs} onAddWorkout={handleAddWorkout} />
              </div>
            )}
            {currentView === 'RECIPES' && (
              <div className="absolute inset-0 z-10">
                <Recipes onLogRecipe={handleAddItems} />
              </div>
            )}
            {currentView === 'HISTORY' && (
              <div className="absolute inset-0 z-10">
                <History logs={logs} profile={profile} />
              </div>
            )}
            {currentView === 'PROFILE' && (
              <div className="absolute inset-0 z-10">
                <Profile existingProfile={profile} onSave={handleSaveProfile} onCancel={() => setCurrentView('DASHBOARD')} />
              </div>
            )}
            {currentView === 'SETTINGS' && (
              <div className="absolute inset-0 z-10">
                <Settings onBack={() => setCurrentView('DASHBOARD')} />
              </div>
            )}
            {currentView === 'COACH' && (
              <div className="absolute inset-0 z-10">
                <Motivation onBack={() => setCurrentView('DASHBOARD')} logs={logs} profile={profile} />
              </div>
            )}
          </div>
          {currentView !== 'SETTINGS' && currentView !== 'COACH' && currentView !== 'PROFILE' && (
            <CoachBanner onTap={() => setCurrentView('COACH')} logs={logs} profile={profile} />
          )}
          {currentView !== 'SETTINGS' && currentView !== 'COACH' && <Navigation currentView={currentView} onChange={setCurrentView} />}
        </div>
      </div>
    </ErrorBoundary>
  );
};
export default App;
