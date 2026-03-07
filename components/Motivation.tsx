
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

  // Calculate user stats from logs
  const userStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayLog = logs[today];
    const todayCalories = todayLog?.items?.reduce((s, i) => s + i.calories, 0) || 0;
    const todayProtein = todayLog?.items?.reduce((s, i) => s + i.protein, 0) || 0;
    const todayWorkouts = todayLog?.workouts || [];
    const todayWorkoutMins = todayWorkouts.reduce((s, w) => s + w.durationMinutes, 0);

    // Last 7 days stats
    const last7Days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
    }

    const weekCalories = last7Days.reduce((s, date) => s + (logs[date]?.items?.reduce((sum, i) => sum + i.calories, 0) || 0), 0);
    const weekWorkouts = last7Days.reduce((s, date) => s + (logs[date]?.workouts?.length || 0), 0);
    const daysTracked = last7Days.filter(date => logs[date]?.items?.length > 0).length;

    // Recent foods
    const recentFoods = todayLog?.items?.slice(-5).map(i => i.name).join(', ') || '';

    // Recent workouts
    const allWorkouts: { type: string; date: string }[] = [];
    Object.entries(logs).forEach(([date, log]: [string, DayLog]) => {
      log.workouts?.forEach(w => allWorkouts.push({ type: w.type, date }));
    });
    const recentWorkouts = allWorkouts.slice(-3).map(w => w.type).join(', ') || '';

    return {
      todayCalories,
      todayProtein,
      todayWorkoutMins,
      weekCalories,
      weekWorkouts,
      daysTracked,
      recentFoods,
      recentWorkouts,
      goal: profile?.customCalories || profile?.tdee || 2000,
      weightKg: profile?.weightKg || 0,
      goalType: profile?.goal || 'maintain'
    };
  }, [logs, profile]);

  // Build context string for AI
  const buildUserContext = (): string => {
    const lines = [];
    lines.push(`USER PROFILE: Goal: ${userStats.goalType}, Target: ${userStats.goal} kcal/day, Weight: ${userStats.weightKg}kg`);
    lines.push(`TODAY: ${userStats.todayCalories} kcal eaten, ${userStats.todayProtein}g protein, ${userStats.todayWorkoutMins} min workout`);
    lines.push(`THIS WEEK: ${userStats.weekCalories} total kcal, ${userStats.weekWorkouts} workouts, ${userStats.daysTracked}/7 days tracked`);
    if (userStats.recentFoods) lines.push(`RECENT FOODS: ${userStats.recentFoods}`);
    if (userStats.recentWorkouts) lines.push(`RECENT WORKOUTS: ${userStats.recentWorkouts}`);
    return lines.join('\n');
  };

  useEffect(() => {
    const moods = getMoods();
    const loadedMessages: ChatMessage[] = [];
    moods.forEach(m => {
      loadedMessages.push({ id: m.id + '_user', text: m.mood, sender: 'USER', timestamp: m.timestamp });
      loadedMessages.push({ id: m.id + '_ai', text: m.advice || '', sender: 'AI', timestamp: m.timestamp + 1 });
    });
    if (loadedMessages.length === 0) {
      const name = profile?.name || '';
      const greeting = userStats.todayCalories > 0
        ? `Hey${name ? ' ' + name : ''}! ${userStats.todayCalories} kcal so far today - how's your day going?`
        : `Hey${name ? ' ' + name : ''}! What's up? Tell me about your day or ask me anything.`;
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

  const getChatHistory = (): ChatHistoryItem[] => {
    return messages.slice(-10).map(m => ({
      role: m.sender === 'USER' ? 'user' as const : 'assistant' as const,
      content: m.text
    }));
  };

  const handleSend = async (customInput?: string) => {
    const textToSend = customInput || input;
    if (!textToSend.trim()) return;
    const userMsg: ChatMessage = { id: generateId(), text: textToSend, sender: 'USER', timestamp: Date.now() };
    setMessages(p => [...p, userMsg]);
    setInput('');
    setLoading(true);
    setTimeout(scrollToBottom, 100);

    const chatHistory = getChatHistory();
    const userContext = buildUserContext();

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
    setMessages([{
      id: 'init',
      text: `Hey${profile?.name ? ' ' + profile.name : ''}! Fresh start. What's on your mind?`,
      sender: 'AI',
      timestamp: Date.now()
    }]);
  };

  // Smart suggested prompts based on user data
  const suggestedPrompts = useMemo(() => {
    const prompts = [];

    if (userStats.todayCalories === 0) {
      prompts.push("What should I eat for breakfast?");
    } else if (userStats.todayCalories < userStats.goal * 0.5) {
      prompts.push("How am I doing today?");
    } else if (userStats.todayCalories > userStats.goal) {
      prompts.push("I went over my calories, help!");
    }

    if (userStats.todayWorkoutMins === 0) {
      prompts.push("Give me a quick workout");
    }

    prompts.push("Analyze my week");
    prompts.push("Tips for my goal");
    prompts.push("What should I eat next?");

    return prompts.slice(0, 4);
  }, [userStats]);

  return (
    <div className="h-full flex flex-col bg-[#FAFAF8]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100/80 px-4 pb-2.5" style={{paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)'}}>
        <div className="flex items-center justify-between">
          {onBack ? (
            <button onClick={onBack} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center active:scale-95 transition-transform">
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
            <button onClick={clearChat} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center active:scale-95 transition-transform">
              <Trash2 className="w-[18px] h-[18px] text-gray-400" />
            </button>
            <button onClick={() => setShowHelp(true)} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center active:scale-95 transition-transform">
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
          <button onClick={cycleStyle} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${styleColors[currentStyle]}`}>
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
                className="px-4 py-2.5 bg-white hover:bg-[#E07A5F]/10 text-gray-600 text-sm rounded-xl transition-colors shadow-sm border border-gray-100 active:scale-95"
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
            className="flex-1 bg-transparent px-3 py-3 outline-none text-gray-800 text-base"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loading}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="w-12 h-12 bg-[#E07A5F] text-white rounded-xl disabled:opacity-50 flex items-center justify-center active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-[#E07A5F] to-[#C85A40] p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-white" />
                <h3 className="font-bold text-white">AI Personal Trainer</h3>
              </div>
              <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-white/20 rounded-lg active:scale-95">
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
