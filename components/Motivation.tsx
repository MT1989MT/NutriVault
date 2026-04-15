
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Brain, Send, Smile, Shield, Zap, Glasses, Sparkles, HelpCircle, X, ArrowLeft, Trash2, Dumbbell, Utensils, TrendingUp, Flame } from 'lucide-react';
import { getMotivationMessage, ChatHistoryItem } from '../services/gemini';
import { getProfile, saveMood, getMoods, saveProfile } from '../services/storage';
import { generateId } from '../utils/calculations';
import { CoachPersonality, UserProfile, DayLog } from '../types';
import { t as tr } from '../utils/i18n';

interface ChatMessage { id: string; text: string; sender: 'USER' | 'AI'; timestamp: number; }

interface MotivationProps {
  onBack?: () => void;
  logs?: Record<string, DayLog>;
  profile?: UserProfile | null;
}

const Motivation: React.FC<MotivationProps> = ({ onBack, logs = {}, profile: propProfile }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const profile = propProfile || getProfile();
  const [currentStyle, setCurrentStyle] = useState<CoachPersonality>(profile?.coachPersonality || 'FRIENDLY');
  const [showHelp, setShowHelp] = useState(false);

  // Calculate user stats from logs — single-pass where possible
  const userStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayLog = logs[today];
    const todayItems = todayLog?.items || [];

    // Single pass for today's macros
    let todayCalories = 0, todayProtein = 0, todayCarbs = 0, todayFat = 0;
    const todayFoodsByMeal: Record<string, string[]> = {};
    for (let i = 0; i < todayItems.length; i++) {
      const item = todayItems[i];
      todayCalories += item.calories;
      todayProtein += item.protein;
      todayCarbs += item.carbs;
      todayFat += item.fat;
      const meal = item.mealType || 'SNACK';
      if (!todayFoodsByMeal[meal]) todayFoodsByMeal[meal] = [];
      todayFoodsByMeal[meal].push(item.name);
    }

    const todayWorkouts = todayLog?.workouts || [];
    let todayWorkoutMins = 0;
    for (let i = 0; i < todayWorkouts.length; i++) todayWorkoutMins += todayWorkouts[i].durationMinutes;
    const todayWater = todayLog?.waterIntakeMl || 0;

    const todayFoodsSummary = Object.entries(todayFoodsByMeal)
      .map(([meal, foods]) => `${meal}: ${foods.join(', ')}`)
      .join(' | ') || 'Nothing logged yet';

    // Last 7 days — single pass per day
    const last7Days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
    }

    let weekCalories = 0, weekProtein = 0, weekWorkouts = 0, daysTracked = 0;
    for (const date of last7Days) {
      const dayItems = logs[date]?.items;
      if (dayItems && dayItems.length > 0) {
        daysTracked++;
        for (let i = 0; i < dayItems.length; i++) {
          weekCalories += dayItems[i].calories;
          weekProtein += dayItems[i].protein;
        }
      }
      weekWorkouts += logs[date]?.workouts?.length || 0;
    }
    const avgDailyCalories = daysTracked > 0 ? Math.round(weekCalories / daysTracked) : 0;
    const avgDailyProtein = daysTracked > 0 ? Math.round(weekProtein / daysTracked) : 0;

    // Recent workouts + weight trend — single pass over all logs
    const recentWorkoutsArr: { type: string; date: string; duration: number }[] = [];
    const weightEntries: { date: string; weight: number }[] = [];
    const entries = Object.entries(logs);
    for (let i = 0; i < entries.length; i++) {
      const [date, log] = entries[i] as [string, DayLog];
      if (log.workouts) {
        for (let j = 0; j < log.workouts.length; j++) {
          recentWorkoutsArr.push({ type: log.workouts[j].type, date, duration: log.workouts[j].durationMinutes });
        }
      }
      if (log.weightLog) weightEntries.push({ date, weight: log.weightLog });
    }
    const recentWorkouts = recentWorkoutsArr.slice(-5).map(w => `${w.type} (${w.duration}min, ${w.date})`).join(', ') || '';
    weightEntries.sort((a, b) => a.date.localeCompare(b.date));
    const latestWeight = weightEntries.length > 0 ? weightEntries[weightEntries.length - 1] : null;
    const weightTrend = weightEntries.length >= 2
      ? (weightEntries[weightEntries.length - 1].weight - weightEntries[weightEntries.length - 2].weight)
      : null;

    return {
      todayCalories, todayProtein, todayCarbs, todayFat, todayWorkoutMins, todayWater,
      todayItemCount: todayItems.length, todayFoodsSummary,
      weekCalories, weekProtein, weekWorkouts, daysTracked, avgDailyCalories, avgDailyProtein,
      recentWorkouts, latestWeight, weightTrend,
      goal: profile?.customCalories || profile?.tdee || 2000,
      weightKg: profile?.weightKg || 0,
      goalType: profile?.goal || 'maintain',
      targetWeightKg: profile?.targetWeightKg || 0,
      dietaryPreferences: profile?.dietaryPreferences || [],
    };
  }, [logs, profile]);

  // Build context string for AI — memoized since it only changes when stats/profile change
  const userContext = useMemo(() => {
    const lines = [];
    const goalLabels: Record<string, string> = { LOSE: 'Weight loss', MAINTAIN: 'Maintain weight', GAIN: 'Muscle gain / bulk', FIT: 'General fitness' };

    lines.push(`USER: ${profile?.name || 'Unknown'}, ${profile?.age || '?'}y, ${userStats.weightKg}kg${userStats.targetWeightKg ? ` → target ${userStats.targetWeightKg}kg` : ''}`);
    lines.push(`GOAL: ${goalLabels[userStats.goalType] || userStats.goalType}, Daily target: ${userStats.goal} kcal`);
    if (userStats.dietaryPreferences.length > 0) lines.push(`DIETARY PREFERENCES: ${userStats.dietaryPreferences.join(', ')}`);

    lines.push('');
    lines.push(`--- TODAY ---`);
    lines.push(`Calories: ${userStats.todayCalories} / ${userStats.goal} kcal (${userStats.goal - userStats.todayCalories} remaining)`);
    lines.push(`Macros: ${userStats.todayProtein}g protein, ${userStats.todayCarbs}g carbs, ${userStats.todayFat}g fat`);
    lines.push(`Foods logged: ${userStats.todayFoodsSummary}`);
    if (userStats.todayWorkoutMins > 0) lines.push(`Workout today: ${userStats.todayWorkoutMins} min`);
    if (userStats.todayWater > 0) lines.push(`Water: ${(userStats.todayWater / 1000).toFixed(1)}L`);

    lines.push('');
    lines.push(`--- THIS WEEK (last 7 days) ---`);
    lines.push(`Days tracked: ${userStats.daysTracked}/7`);
    lines.push(`Avg daily: ${userStats.avgDailyCalories} kcal, ${userStats.avgDailyProtein}g protein`);
    lines.push(`Workouts: ${userStats.weekWorkouts} sessions`);
    if (userStats.recentWorkouts) lines.push(`Recent workouts: ${userStats.recentWorkouts}`);

    if (userStats.latestWeight) {
      lines.push('');
      lines.push(`--- WEIGHT ---`);
      lines.push(`Latest: ${userStats.latestWeight.weight}kg (${userStats.latestWeight.date})`);
      if (userStats.weightTrend !== null) {
        lines.push(`Trend: ${userStats.weightTrend > 0 ? '+' : ''}${userStats.weightTrend.toFixed(1)}kg since previous weigh-in`);
      }
    }

    return lines.join('\n');
  }, [userStats, profile]);

  useEffect(() => {
    const moods = getMoods();
    const loadedMessages: ChatMessage[] = [];
    moods.forEach(m => {
      loadedMessages.push({ id: m.id + '_user', text: m.mood, sender: 'USER', timestamp: m.timestamp });
      loadedMessages.push({ id: m.id + '_ai', text: m.advice || '', sender: 'AI', timestamp: m.timestamp + 1 });
    });
    if (loadedMessages.length === 0) {
      const name = profile?.name || '';
      const hour = new Date().getHours();
      const lang = (navigator.language || 'en').split('-')[0];
      const isNL = lang === 'nl';
      let greeting: string;

      if (isNL) {
        const timeGreet = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Hoi' : 'Goedenavond';
        if (userStats.todayCalories > 0) {
          const remaining = userStats.goal - userStats.todayCalories;
          greeting = `${timeGreet}${name ? ' ' + name : ''}! Je zit op ${userStats.todayCalories} kcal vandaag${remaining > 0 ? `, nog ${remaining} te gaan` : ''}. Waar kan ik mee helpen?`;
        } else {
          greeting = `${timeGreet}${name ? ' ' + name : ''}! Stel me een vraag, vraag advies, of gewoon kletsen — ik ben er voor je.`;
        }
      } else {
        const timeGreet = hour < 12 ? 'Good morning' : hour < 18 ? 'Hey' : 'Good evening';
        if (userStats.todayCalories > 0) {
          const remaining = userStats.goal - userStats.todayCalories;
          greeting = `${timeGreet}${name ? ' ' + name : ''}! You're at ${userStats.todayCalories} kcal today${remaining > 0 ? `, ${remaining} to go` : ''}. What can I help with?`;
        } else {
          greeting = `${timeGreet}${name ? ' ' + name : ''}! Ask me anything — nutrition advice, meal ideas, workout tips, or just chat.`;
        }
      }
      loadedMessages.push({ id: 'init', text: greeting, sender: 'AI', timestamp: Date.now() });
    }
    setMessages(loadedMessages.sort((a, b) => a.timestamp - b.timestamp));
    setTimeout(scrollToBottom, 100);
  }, []);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

  const cycleStyle = () => {
    const styles: CoachPersonality[] = ['FRIENDLY', 'STOIC', 'TOUGH_LOVE', 'SCIENTIFIC', 'HUMOROUS'];
    const nextIdx = (styles.indexOf(currentStyle) + 1) % styles.length;
    const nextStyle = styles[nextIdx];
    setCurrentStyle(nextStyle);
    if (profile) saveProfile({ ...profile, coachPersonality: nextStyle });
  };

  const getStyleIcon = () => {
    switch (currentStyle) {
      case 'STOIC': return <Shield className="w-5 h-5" />;
      case 'TOUGH_LOVE': return <Zap className="w-5 h-5" />;
      case 'SCIENTIFIC': return <Glasses className="w-5 h-5" />;
      case 'HUMOROUS': return <Sparkles className="w-5 h-5" />;
      default: return <Smile className="w-5 h-5" />;
    }
  };

  const getStyleLabel = () => {
    switch (currentStyle) {
      case 'STOIC': return 'Stoic';
      case 'TOUGH_LOVE': return 'Tough';
      case 'SCIENTIFIC': return 'Science';
      case 'HUMOROUS': return 'Funny';
      default: return 'Friendly';
    }
  };

  const styleColors: Record<CoachPersonality, string> = {
    'FRIENDLY': 'bg-[#E07A5F] text-white',
    'STOIC': 'bg-gray-600 text-white',
    'TOUGH_LOVE': 'bg-yellow-500 text-white',
    'SCIENTIFIC': 'bg-blue-500 text-white',
    'HUMOROUS': 'bg-purple-500 text-white'
  };

  const chatHistory = useMemo((): ChatHistoryItem[] => {
    return messages.slice(-16).map(m => ({
      role: m.sender === 'USER' ? 'user' as const : 'assistant' as const,
      content: m.text
    }));
  }, [messages]);

  const handleSend = async (customInput?: string) => {
    const textToSend = customInput || input;
    if (!textToSend.trim()) return;
    const userMsg: ChatMessage = { id: generateId(), text: textToSend, sender: 'USER', timestamp: Date.now() };
    setMessages(p => [...p, userMsg]);
    setInput('');
    setLoading(true);
    setTimeout(scrollToBottom, 100);

    const advice = await getMotivationMessage(
      userMsg.text,
      profile?.mentalConditions || [],
      currentStyle,
      profile?.habits || [],
      chatHistory,
      userContext
    );

    const aiMsg: ChatMessage = { id: generateId(), text: advice, sender: 'AI', timestamp: Date.now() + 1 };
    setMessages(p => [...p, aiMsg]);
    setLoading(false);
    setTimeout(scrollToBottom, 100);
    saveMood({ id: userMsg.id, timestamp: userMsg.timestamp, mood: userMsg.text, advice: aiMsg.text });
  };

  const clearChat = () => {
    localStorage.removeItem('nutrivault_moods');
    const lang = (navigator.language || 'en').split('-')[0];
    const isNL = lang === 'nl';
    const name = profile?.name ? ' ' + profile.name : '';
    setMessages([{
      id: 'init',
      text: isNL
        ? `Hey${name}! Schone lei. Waar wil je het over hebben?`
        : `Hey${name}! Fresh start. What's on your mind?`,
      sender: 'AI',
      timestamp: Date.now()
    }]);
  };

  // Smart suggested prompts based on user data and time of day
  const suggestedPrompts = useMemo(() => {
    const prompts: string[] = [];
    const hour = new Date().getHours();
    const lang = (navigator.language || 'en').split('-')[0];
    const isNL = lang === 'nl';

    // Time-based suggestions
    if (userStats.todayCalories === 0) {
      if (hour < 11) {
        prompts.push(isNL ? "Wat zal ik ontbijten?" : "What should I eat for breakfast?");
      } else if (hour < 14) {
        prompts.push(isNL ? "Wat zal ik lunchen?" : "What should I have for lunch?");
      } else {
        prompts.push(isNL ? "Wat zal ik eten vanavond?" : "What should I eat tonight?");
      }
    } else if (userStats.todayCalories > userStats.goal) {
      prompts.push(isNL ? "Ik zit over mijn calorieën..." : "I went over my calories...");
    } else {
      const remaining = userStats.goal - userStats.todayCalories;
      if (remaining > 500 && hour >= 17) {
        prompts.push(isNL ? `Nog ${remaining} kcal over, tips?` : `${remaining} kcal left, suggestions?`);
      } else {
        prompts.push(isNL ? "Hoe gaat het vandaag?" : "How am I doing today?");
      }
    }

    // Protein check
    if (userStats.todayProtein < 50 && userStats.todayCalories > 500) {
      prompts.push(isNL ? "Eet ik genoeg eiwit?" : "Am I eating enough protein?");
    }

    // Workout suggestion
    if (userStats.todayWorkoutMins === 0 && hour >= 8 && hour <= 20) {
      prompts.push(isNL ? "Geef me een workout" : "Give me a quick workout");
    }

    // Weekly analysis
    if (userStats.daysTracked >= 3) {
      prompts.push(isNL ? "Analyseer mijn week" : "Analyze my week");
    }

    // General
    prompts.push(isNL ? "Tips voor mijn doel" : "Tips for my goal");

    return prompts.slice(0, 4);
  }, [userStats]);

  return (
    <div className="h-full flex flex-col bg-[#FAFAF8]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100/80 px-4 pb-2.5" style={{paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)'}}>
        <div className="flex items-center justify-between">
          {onBack ? (
            <button onClick={onBack} aria-label="Go back" className="w-11 h-11 bg-gray-50 rounded-xl flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2">
              <ArrowLeft className="w-[18px] h-[18px] text-gray-400" />
            </button>
          ) : (
            <div className="w-10" />
          )}
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#E07A5F]" />
            <span className="text-[20px] font-extrabold text-gray-900 font-display tracking-tight">{tr('coach')}</span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={clearChat} aria-label="Clear chat" className="w-11 h-11 bg-gray-50 rounded-xl flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2">
              <Trash2 className="w-[18px] h-[18px] text-gray-400" />
            </button>
            <button onClick={() => setShowHelp(true)} aria-label="Help" className="w-11 h-11 bg-gray-50 rounded-xl flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E07A5F] focus-visible:ring-offset-2">
              <HelpCircle className="w-[18px] h-[18px] text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Sub-header with stats */}
      <div className="px-4 py-3 bg-[#FAFAF8]">

        {/* Quick Stats Bar */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 bg-white rounded-xl p-2.5 shadow-sm flex items-center gap-2">
            <Utensils className="w-4 h-4 text-[#E07A5F]" />
            <div>
              <span className="text-sm font-bold text-gray-900">{userStats.todayCalories}</span>
              <span className="text-[10px] text-gray-400 ml-1">kcal</span>
            </div>
          </div>
          <div className="flex-1 bg-white rounded-xl p-2.5 shadow-sm flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-blue-500" />
            <div>
              <span className="text-sm font-bold text-gray-900">{userStats.todayWorkoutMins}</span>
              <span className="text-[10px] text-gray-400 ml-1">min</span>
            </div>
          </div>
          <div className="flex-1 bg-white rounded-xl p-2.5 shadow-sm flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500" />
            <div>
              <span className="text-sm font-bold text-gray-900">{userStats.daysTracked}</span>
              <span className="text-[10px] text-gray-400 ml-1">/7 days</span>
            </div>
          </div>
        </div>

        {/* Style Selector */}
        <div className="flex items-center justify-center gap-2">
          <button onClick={cycleStyle} aria-label={`Switch coach style, currently ${getStyleLabel()}`} className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 min-h-[44px] ${styleColors[currentStyle]}`}>
            {getStyleIcon()}
            <span>{getStyleLabel()} Mode</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3 mb-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'USER' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${msg.sender === 'USER' ? 'bg-[#E07A5F] text-white rounded-br-md' : 'bg-white text-gray-800 shadow-sm border border-gray-50 rounded-bl-md'}`}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white shadow-sm border border-gray-50 px-4 py-3 rounded-2xl rounded-bl-md flex gap-1.5">
              <span className="w-2.5 h-2.5 bg-gray-300 rounded-full animate-bounce"></span>
              <span className="w-2.5 h-2.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
              <span className="w-2.5 h-2.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested Prompts */}
      {messages.length <= 2 && !loading && (
        <div className="px-4 mb-3">
          <div className="flex flex-wrap gap-2">
            {suggestedPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(prompt)}
                className="px-4 py-3 bg-white hover:bg-[#E07A5F]/10 text-gray-600 text-sm rounded-xl transition-colors shadow-sm border border-gray-100 active:scale-95 min-h-[44px]"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4" style={{paddingBottom: 'max(env(safe-area-inset-bottom), 16px)'}}>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 flex items-center p-2 gap-2">
          <input
            type="text"
            placeholder={tr('askAnything') + "..."}
            className="flex-1 bg-transparent px-3 py-3 outline-none text-gray-800 text-base focus:ring-2 focus:ring-[#E07A5F]/30 rounded-lg"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loading}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            aria-label="Send message"
            className="w-12 h-12 bg-[#E07A5F] text-white rounded-xl disabled:opacity-50 flex items-center justify-center active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="AI Coach help">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-[#E07A5F] to-[#C85A40] p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-white" />
                <h3 className="font-bold text-white">AI Personal Trainer</h3>
              </div>
              <button onClick={() => setShowHelp(false)} aria-label="Close help" className="p-2 hover:bg-white/20 rounded-lg active:scale-95">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm text-gray-600 max-h-80 overflow-y-auto">
              <div className="bg-[#E07A5F]/10 rounded-xl p-3">
                <p className="font-bold text-gray-900 mb-1">🧠 I know your data!</p>
                <p className="text-xs">I can see your food logs, workouts, weight, and progress. Ask me personalized questions!</p>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Try asking:</p>
                <ul className="space-y-1.5 text-xs">
                  <li>• "How am I doing this week?"</li>
                  <li>• "Am I eating enough protein?"</li>
                  <li>• "What should I eat for dinner?"</li>
                  <li>• "Give me a leg workout"</li>
                  <li>• "Help me reach my goal"</li>
                </ul>
              </div>

              <div className="bg-white rounded-xl p-3 border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Coach Styles</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><Smile className="w-4 h-4 text-[#E07A5F]" /><span className="text-xs"><strong>Friendly</strong> - encouraging & supportive</span></div>
                  <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-gray-600" /><span className="text-xs"><strong>Stoic</strong> - calm & disciplined</span></div>
                  <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-500" /><span className="text-xs"><strong>Tough</strong> - direct & challenging</span></div>
                  <div className="flex items-center gap-2"><Glasses className="w-4 h-4 text-blue-500" /><span className="text-xs"><strong>Science</strong> - data-driven advice</span></div>
                  <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500" /><span className="text-xs"><strong>Funny</strong> - witty & playful</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Motivation;
