
import React from 'react';
import { FoodItem } from '../types';
import { Search, Check } from 'lucide-react';

interface AnalysisModalProps { items: Omit<FoodItem, 'id' | 'timestamp'>[]; onConfirm: () => void; onCancel: () => void; }

const AnalysisModal: React.FC<AnalysisModalProps> = ({ items, onConfirm, onCancel }) => {
  const t = items.reduce((acc, i) => ({ cal: acc.cal+i.calories, p: acc.p+i.protein, c: acc.c+i.carbs, f: acc.f+i.fat }), {cal:0,p:0,c:0,f:0});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D3436]/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[1.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-white px-6 pt-5 pb-2">
          <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold text-gray-900 tracking-tight">Confirm Log</h2><span className="bg-[#E07A5F]/10 text-[#E07A5F] text-[10px] font-bold px-2 py-0.5 rounded-full">{items.length} item(s)</span></div>
          <div className="space-y-2 mt-2 max-h-40 overflow-y-auto pr-1">
            {items.map((item, idx) => (
              <div key={idx} className="bg-gray-50/80 rounded-xl p-3">
                <div className="flex justify-between items-start mb-1.5">
                  <span className="font-bold text-gray-800 text-sm leading-tight pr-2">{item.name}</span>
                  <span className="font-bold text-gray-900 text-sm shrink-0">{Math.round(item.calories)} kcal</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#E07A5F] text-xs font-semibold">{item.amountDescription}</span>
                  <div className="flex gap-2 text-[10px] font-bold">
                    <span className="text-[#E07A5F]">P {Math.round(item.protein)}</span>
                    <span className="text-[#81B29A]">C {Math.round(item.carbs)}</span>
                    <span className="text-[#F2CC8F]">F {Math.round(item.fat)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 py-3 space-y-3">
          <div className="bg-[#FAFAF8] rounded-2xl p-4 border border-[#E07A5F]/10">
            <div className="flex items-center justify-between mb-3">
               <div><div className="text-3xl font-black text-gray-900 tracking-tight font-display">{Math.round(t.cal)}</div><div className="text-[10px] text-gray-400 font-bold uppercase">Total Kcal</div></div>
               <div className="flex gap-2">
                  <div className="bg-white px-2 py-1.5 rounded-xl shadow-sm text-center min-w-[3.5rem]"><div className="text-sm font-bold text-gray-900">{Math.round(t.p)}g</div><div className="text-[8px] text-[#E07A5F] uppercase font-bold">Prot</div></div>
                  <div className="bg-white px-2 py-1.5 rounded-xl shadow-sm text-center min-w-[3.5rem]"><div className="text-sm font-bold text-gray-900">{Math.round(t.c)}g</div><div className="text-[8px] text-[#81B29A] uppercase font-bold">Carb</div></div>
                  <div className="bg-white px-2 py-1.5 rounded-xl shadow-sm text-center min-w-[3.5rem]"><div className="text-sm font-bold text-gray-900">{Math.round(t.f)}g</div><div className="text-[8px] text-[#F2CC8F] uppercase font-bold">Fat</div></div>
               </div>
            </div>
          </div>
        </div>
        <div className="p-4 bg-white flex gap-3 border-t border-gray-50"><button onClick={onCancel} className="flex-1 py-3 rounded-xl text-gray-500 font-semibold text-xs hover:bg-gray-50">Cancel</button><button onClick={onConfirm} className="flex-1 bg-[#E07A5F] hover:bg-[#D0694F] text-white font-bold rounded-xl shadow-md py-3 flex items-center justify-center gap-2 text-xs"><Check className="w-4 h-4" /> Log It</button></div>
      </div>
    </div>
  );
};
export default AnalysisModal;
