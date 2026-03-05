
import React, { useState, useMemo } from 'react';
import { FoodItem } from '../types';
import { Check, Minus, Plus, Trash2, X } from 'lucide-react';

interface EditableItem extends Omit<FoodItem, 'id' | 'timestamp'> {
  grams?: number;
  baseProteinPer100g?: number;
  baseCarbsPer100g?: number;
  baseFatPer100g?: number;
  removed?: boolean;
}

interface AnalysisModalProps {
  items: Omit<FoodItem, 'id' | 'timestamp'>[];
  onConfirm: (items: Omit<FoodItem, 'id' | 'timestamp'>[]) => void;
  onCancel: () => void;
}

const AnalysisModal: React.FC<AnalysisModalProps> = ({ items: initialItems, onConfirm, onCancel }) => {
  const [editableItems, setEditableItems] = useState<EditableItem[]>(() =>
    initialItems.map(item => {
      const g = (item as any).grams || 100;
      return {
        ...item,
        grams: g,
        // Calculate per-100g base values for scaling
        baseProteinPer100g: g > 0 ? (item.protein / g) * 100 : item.protein,
        baseCarbsPer100g: g > 0 ? (item.carbs / g) * 100 : item.carbs,
        baseFatPer100g: g > 0 ? (item.fat / g) * 100 : item.fat,
        removed: false,
      };
    })
  );

  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const activeItems = editableItems.filter(i => !i.removed);

  const totals = useMemo(() =>
    activeItems.reduce((acc, i) => ({
      cal: acc.cal + i.calories,
      p: acc.p + i.protein,
      c: acc.c + i.carbs,
      f: acc.f + i.fat,
    }), { cal: 0, p: 0, c: 0, f: 0 }),
    [activeItems]
  );

  const updateItemGrams = (idx: number, newGrams: number) => {
    setEditableItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const g = Math.max(1, newGrams);
      const protein = Math.round((item.baseProteinPer100g || 0) * g / 100);
      const carbs = Math.round((item.baseCarbsPer100g || 0) * g / 100);
      const fat = Math.round((item.baseFatPer100g || 0) * g / 100);
      const calories = (protein * 4) + (carbs * 4) + (fat * 9);
      return {
        ...item,
        grams: g,
        protein,
        carbs,
        fat,
        calories,
        amountDescription: `~${g}g`,
      };
    }));
  };

  const removeItem = (idx: number) => {
    setEditableItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, removed: true } : item
    ));
    setExpandedIdx(null);
  };

  const handleConfirm = () => {
    const itemsToLog = activeItems.map(({ baseProteinPer100g, baseCarbsPer100g, baseFatPer100g, removed, grams, ...rest }) => rest);
    onConfirm(itemsToLog);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-[#2D3436]/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-t-[1.5rem] sm:rounded-[1.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 max-h-[80vh] flex flex-col" style={{ marginBottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Header */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
          <button onClick={onCancel} className="text-gray-400 p-1">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-gray-900">Review & Adjust</h2>
          <span className="bg-[#E07A5F]/10 text-[#E07A5F] text-[10px] font-bold px-2 py-0.5 rounded-full">
            {activeItems.length} item{activeItems.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Scrollable item list */}
        <div className="overflow-y-auto flex-1 px-4 pb-2">
          <div className="space-y-2">
            {editableItems.map((item, idx) => {
              if (item.removed) return null;
              const isExpanded = expandedIdx === idx;

              return (
                <div key={idx} className={`rounded-xl border transition-all ${isExpanded ? 'border-[#E07A5F]/30 bg-[#FAFAF8]' : 'border-gray-100 bg-gray-50/80'}`}>
                  {/* Item row - always visible */}
                  <button
                    className="w-full p-3 text-left"
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-gray-800 text-sm leading-tight pr-2">{item.name}</span>
                      <span className="font-bold text-gray-900 text-sm shrink-0">{Math.round(item.calories)} kcal</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#E07A5F] text-xs font-semibold">
                        {item.grams ? `~${item.grams}g` : item.amountDescription}
                      </span>
                      <div className="flex gap-2 text-[10px] font-bold">
                        <span className="text-[#E07A5F]">P {Math.round(item.protein)}</span>
                        <span className="text-[#81B29A]">C {Math.round(item.carbs)}</span>
                        <span className="text-[#F2CC8F]">F {Math.round(item.fat)}</span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded: gram adjustment */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-0">
                      <div className="h-px bg-gray-200 mb-3" />

                      {/* Gram slider with +/- buttons */}
                      <div className="flex items-center gap-3 mb-3">
                        <button
                          onClick={() => updateItemGrams(idx, (item.grams || 100) - 10)}
                          className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
                        >
                          <Minus className="w-4 h-4 text-gray-600" />
                        </button>

                        <div className="flex-1 relative">
                          <input
                            type="number"
                            value={item.grams || ''}
                            onChange={(e) => updateItemGrams(idx, parseInt(e.target.value) || 0)}
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-center text-base font-bold text-gray-900 outline-none focus:border-[#E07A5F]/40"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">g</span>
                        </div>

                        <button
                          onClick={() => updateItemGrams(idx, (item.grams || 100) + 10)}
                          className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
                        >
                          <Plus className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>

                      {/* Quick gram presets */}
                      <div className="grid grid-cols-5 gap-1.5 mb-3">
                        {[10, 25, 50, 100, 150].map(g => (
                          <button
                            key={g}
                            onClick={() => updateItemGrams(idx, g)}
                            className={`py-2 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                              item.grams === g
                                ? 'bg-[#E07A5F] text-white'
                                : 'bg-white border border-gray-200 text-gray-600'
                            }`}
                          >
                            {g}g
                          </button>
                        ))}
                      </div>

                      {/* Macro preview for this item */}
                      <div className="flex gap-1.5 mb-3">
                        <div className="flex-1 bg-white rounded-lg p-1.5 text-center border border-gray-100">
                          <div className="text-xs font-bold text-gray-900">{Math.round(item.protein)}g</div>
                          <div className="text-[8px] text-[#E07A5F] font-bold">PROT</div>
                        </div>
                        <div className="flex-1 bg-white rounded-lg p-1.5 text-center border border-gray-100">
                          <div className="text-xs font-bold text-gray-900">{Math.round(item.carbs)}g</div>
                          <div className="text-[8px] text-[#81B29A] font-bold">CARB</div>
                        </div>
                        <div className="flex-1 bg-white rounded-lg p-1.5 text-center border border-gray-100">
                          <div className="text-xs font-bold text-gray-900">{Math.round(item.fat)}g</div>
                          <div className="text-[8px] text-[#F2CC8F] font-bold">FAT</div>
                        </div>
                      </div>

                      {/* Remove item */}
                      <button
                        onClick={() => removeItem(idx)}
                        className="w-full py-2 bg-red-50 text-red-400 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals bar */}
        <div className="px-4 py-3 shrink-0">
          <div className="bg-[#FAFAF8] rounded-2xl p-3 border border-[#E07A5F]/10">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-black text-gray-900 tracking-tight">{Math.round(totals.cal)}</div>
                <div className="text-[9px] text-gray-400 font-bold uppercase">Total kcal</div>
              </div>
              <div className="flex gap-1.5">
                <div className="bg-white px-2 py-1 rounded-lg shadow-sm text-center min-w-[3rem]">
                  <div className="text-xs font-bold text-gray-900">{Math.round(totals.p)}g</div>
                  <div className="text-[7px] text-[#E07A5F] uppercase font-bold">Prot</div>
                </div>
                <div className="bg-white px-2 py-1 rounded-lg shadow-sm text-center min-w-[3rem]">
                  <div className="text-xs font-bold text-gray-900">{Math.round(totals.c)}g</div>
                  <div className="text-[7px] text-[#81B29A] uppercase font-bold">Carb</div>
                </div>
                <div className="bg-white px-2 py-1 rounded-lg shadow-sm text-center min-w-[3rem]">
                  <div className="text-xs font-bold text-gray-900">{Math.round(totals.f)}g</div>
                  <div className="text-[7px] text-[#F2CC8F] uppercase font-bold">Fat</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-4 pt-0 flex gap-3 shrink-0">
          <button onClick={onCancel} className="flex-1 py-3.5 rounded-xl text-gray-500 font-semibold text-sm hover:bg-gray-50 active:scale-[0.98] transition-transform">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={activeItems.length === 0}
            className="flex-1 bg-[#E07A5F] hover:bg-[#D0694F] disabled:opacity-40 text-white font-bold rounded-xl shadow-md py-3.5 flex items-center justify-center gap-2 text-sm active:scale-[0.98] transition-transform"
          >
            <Check className="w-4 h-4" />
            Log {activeItems.length} item{activeItems.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalysisModal;
