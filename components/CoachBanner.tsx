import React, { useState, useEffect, useCallback } from 'react';
import { Brain, ChevronRight, Loader2 } from 'lucide-react';
import { getMotivationMessage, ChatHistoryItem } from '../services/gemini';
import { getProfile, getMoods } from '../services/storage';
import { UserProfile, DayLog, CoachPersonality } from '../types';

interface CoachBannerProps {
  onTap: () => void;
  logs?: Record<string, DayLog>;
  profile?: UserProfile | null;
}

const CoachBanner: React.FC<CoachBannerProps> = ({ onTap, logs = {}, profile: propProfile }) => {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const profile = propProfile || getProfile();

  const fetchGreeting = useCallback(async () => {
    if (hasLoaded || loading) return;
    setLoading(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      const todayLog = logs[today];
      const todayCalories = todayLog?.items?.reduce((s, i) => s + i.calories, 0) || 0;
      const todayProtein = todayLog?.items?.reduce((s, i) => s + i.protein, 0) || 0;
      const todayWorkoutMins = (todayLog?.workouts || []).reduce((s, w) => s + w.durationMinutes, 0);
      const target = profile?.customCalories || profile?.tdee || 2000;

      // Last 7 days
      const last7Days: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push(d.toISOString().split('T')[0]);
      }
      const daysTracked = last7Days.filter(date => logs[date]?.items?.length > 0).length;
      const weekWorkouts = last7Days.reduce((s, date) => s + (logs[date]?.workouts?.length || 0), 0);
      const recentFoods = todayLog?.items?.slice(-3).map(i => i.name).join(', ') || '';

      const userContext = [
        `USER: ${profile?.name || 'friend'}, Goal: ${profile?.goal || 'maintain'}, Target: ${target} kcal/day`,
        `TODAY: ${todayCalories} kcal eaten, ${todayProtein}g protein, ${todayWorkoutMins} min workout`,
        `WEEK: ${daysTracked}/7 days tracked, ${weekWorkouts} workouts`,
        recentFoods ? `RECENT FOODS: ${recentFoods}` : '',
      ].filter(Boolean).join('\n');

      // Get last few chat messages for context
      const moods = getMoods();
      const chatHistory: ChatHistoryItem[] = moods.slice(-3).flatMap(m => [
        { role: 'user' as const, content: m.mood },
        { role: 'assistant' as const, content: m.advice },
      ]);

      const style: CoachPersonality = profile?.coachPersonality || 'FRIENDLY';

      const result = await getMotivationMessage(
        '__BANNER_GREETING__',
        profile?.mentalConditions || [],
        style,
        profile?.habits || [],
        chatHistory,
        userContext
      );

      setMessage(result);
    } catch {
      setMessage("Hey! Tap here to chat with me.");
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [hasLoaded, loading, logs, profile]);

  useEffect(() => {
    // Small delay to not block initial render
    const timer = setTimeout(fetchGreeting, 800);
    return () => clearTimeout(timer);
  }, [fetchGreeting]);

  return (
    <button
      onClick={onTap}
      className="fixed left-0 right-0 mx-auto max-w-lg z-50 px-3 py-2 flex items-center gap-2.5 bg-white/95 backdrop-blur-sm border-t border-gray-100/60 active:bg-gray-50 transition-colors"
      style={{ bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="w-8 h-8 bg-gradient-to-br from-[#E07A5F] to-[#C85A40] rounded-xl flex items-center justify-center shrink-0 shadow-sm">
        <Brain className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 text-[#E07A5F] animate-spin" />
            <span className="text-xs text-gray-400">Thinking...</span>
          </div>
        ) : (
          <p className="text-xs text-gray-600 leading-snug line-clamp-2">{message || "Hey! Tap to chat with your AI coach."}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
    </button>
  );
};

export default CoachBanner;
