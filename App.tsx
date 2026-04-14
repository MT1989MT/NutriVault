import React, { useState, useEffect, useCallback } from 'react';
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

  const handleSaveProfile = useCallback((newProfile: UserProfile) => {
    saveProfile(newProfile); setProfile(newProfile); setCurrentView('DASHBOARD');
  }, []);
  const handleAddItems = useCallback((items: FoodItem[], date?: string) => {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const updated = addFoodsToLog(targetDate, items);
    setLogs(updated);
  }, []);
  const handleRemoveItem = useCallback((item: FoodItem, date?: string) => {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const updated = removeFoodFromLog(targetDate, item.id);
    setLogs(updated);
  }, []);
  const handleAddWorkout = useCallback((date: string, workout: WorkoutLog) => {
    const updated = addWorkoutToLog(date, workout);
    setLogs(updated);
  }, []);
  const handleWaterUpdate = useCallback((date: string, ml: number) => {
    const updated = updateWaterIntake(date, ml);
    setLogs(updated);
  }, []);
  const goToSettings = useCallback(() => setCurrentView('SETTINGS'), []);
  const goToCoach = useCallback(() => setCurrentView('COACH'), []);
  const goToDashboard = useCallback(() => setCurrentView('DASHBOARD'), []);

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
                <Dashboard profile={profile} logs={logs} onItemsAdded={handleAddItems} onRemoveItem={handleRemoveItem} onWaterUpdate={handleWaterUpdate} onSettingsClick={goToSettings} onCoachClick={goToCoach} isActive />
              </div>
            )}
            {currentView === 'WORKOUTS' && (
              <div className="absolute inset-0 z-10">
                <Workouts logs={logs} onAddWorkout={handleAddWorkout} onCoachClick={goToCoach} />
              </div>
            )}
            {currentView === 'RECIPES' && (
              <div className="absolute inset-0 z-10">
                <Recipes onLogRecipe={handleAddItems} onCoachClick={goToCoach} />
              </div>
            )}
            {currentView === 'HISTORY' && (
              <div className="absolute inset-0 z-10">
                <History logs={logs} profile={profile} onCoachClick={goToCoach} />
              </div>
            )}
            {currentView === 'PROFILE' && (
              <div className="absolute inset-0 z-10">
                <Profile existingProfile={profile} onSave={handleSaveProfile} onCancel={goToDashboard} />
              </div>
            )}
            {currentView === 'SETTINGS' && (
              <div className="absolute inset-0 z-10">
                <Settings onBack={goToDashboard} />
              </div>
            )}
            {currentView === 'COACH' && (
              <div className="absolute inset-0 z-10">
                <Motivation onBack={goToDashboard} logs={logs} profile={profile} />
              </div>
            )}
          </div>
          {currentView !== 'SETTINGS' && currentView !== 'COACH' && <Navigation currentView={currentView} onChange={setCurrentView} />}
        </div>
      </div>
    </ErrorBoundary>
  );
};
export default App;
