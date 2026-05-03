import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { FoodItem, UserProfile, WorkoutLog } from './types';
import { getProfile, saveProfile, getLogs, addFoodsToLog, removeFoodFromLog, addWorkoutToLog, updateWaterIntake, initializeStorage } from './services/storage';
import { getSession } from './services/auth';
import { initializePurchases } from './services/payments';
import { installGlobalHandlers, createLogger } from './services/logger';
import ErrorBoundary from './components/ErrorBoundary';
import Navigation from './components/Navigation';
import AuthScreen from './components/AuthScreen';
import Onboarding, { hasSeenOnboarding } from './components/Onboarding';

// Eagerly loaded: Dashboard is the primary view, always needed first
import Dashboard from './components/Dashboard';
import Profile from './components/Profile';

// Lazy-loaded: these views are only needed when navigated to
const Recipes = lazy(() => import('./components/Recipes'));
const Motivation = lazy(() => import('./components/Motivation'));
const Workouts = lazy(() => import('./components/Workouts'));
const History = lazy(() => import('./components/History'));
const Settings = lazy(() => import('./components/Settings'));
const PersonalSetup = lazy(() => import('./components/PersonalSetup'));

const ViewFallback = () => (
  <div className="h-full w-full flex items-center justify-center bg-[#FAFAF8]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E07A5F]" />
  </div>
);

type View = 'DASHBOARD' | 'RECIPES' | 'MOTIVATION' | 'PROFILE' | 'WORKOUTS' | 'HISTORY' | 'SETTINGS' | 'COACH';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<Record<string, import('./types').DayLog>>({});
  const [currentView, setCurrentView] = useState<View>('DASHBOARD');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [forceWizard, setForceWizard] = useState(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('wizard')
  );

  useEffect(() => {
    const log = createLogger('App');

    // Install global window.onerror + unhandledrejection handlers (idempotent)
    installGlobalHandlers();

    // Initialize RevenueCat for in-app purchases
    initializePurchases().catch(err => log.warn('RevenueCat init skipped', err));

    // Check if onboarding should be shown
    if (!hasSeenOnboarding()) {
      setShowOnboarding(true);
    }

    const session = getSession();
    if (session) {
      setIsAuthenticated(true);
      try { setProfile(getProfile()); } catch (e) { log.error('Failed to load profile', e); }
      try { setLogs(getLogs()); } catch (e) { log.error('Failed to load logs', e); }
    }
    setIsLoading(false);

    // Initialize IndexedDB in background (non-blocking)
    // After IDB loads, update logs from the IDB source of truth
    initializeStorage().then(() => {
      if (session) {
        try { setLogs(getLogs()); } catch (e) { log.error('Failed to reload logs from IDB', e); }
      }
    }).catch(err => log.warn('IndexedDB init failed, using localStorage', err));
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
  if (forceWizard) return (
    <Suspense fallback={<ViewFallback />}>
      <PersonalSetup existingProfile={profile} onComplete={(p) => { handleSaveProfile(p); setForceWizard(false); }} onCancel={() => setForceWizard(false)} />
    </Suspense>
  );
  if (showOnboarding) return <Onboarding onComplete={() => setShowOnboarding(false)} />;
  if (!isAuthenticated) return <AuthScreen onAuthenticated={() => { setIsAuthenticated(true); setProfile(getProfile()); }} />;
  if (!profile) return (
    <Suspense fallback={<ViewFallback />}>
      <PersonalSetup existingProfile={null} onComplete={handleSaveProfile} />
    </Suspense>
  );

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
            {currentView === 'PROFILE' && (
              <div className="absolute inset-0 z-10">
                <Profile existingProfile={profile} onSave={handleSaveProfile} onCancel={goToDashboard} />
              </div>
            )}
            <Suspense fallback={<div className="absolute inset-0 z-10"><ViewFallback /></div>}>
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
            </Suspense>
          </div>
          {currentView !== 'SETTINGS' && currentView !== 'COACH' && <Navigation currentView={currentView} onChange={setCurrentView} />}
        </div>
      </div>
    </ErrorBoundary>
  );
};
export default App;
