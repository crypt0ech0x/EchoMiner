
import React, { useState } from 'react';
import { AppState, StoreItem } from '../lib/types';
import { EchoAPI } from '../lib/api';
import { STORE_ITEMS } from '../lib/constants';
import { Gem, Crown, Sparkles, Check, Loader2, History, ChevronRight, Zap } from 'lucide-react';

interface StoreTabProps {
  state: AppState;
  onPurchase: (newState: AppState) => void;
}

const StoreTab: React.FC<StoreTabProps> = ({ state, onPurchase }) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handleStartPurchase = async (item: StoreItem) => {
    setProcessingId(item.id);
    try {
      const sessionId = await EchoAPI.createStripeSession(item.id);
      
      // Simulate Stripe Interaction
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const newState = await EchoAPI.handleStripeWebhook(sessionId);
      onPurchase(newState);
      alert(`Payment Successful! ${item.name} activated.`);
    } catch (err: any) {
      alert(err.message || "Purchase failed.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="px-6 space-y-8 animate-in slide-in-from-right duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Marketplace</h2>
          <p className="text-slate-400 text-sm mt-1">Acquire ECHO bundles directly.</p>
        </div>
        <button 
          onClick={() => setShowHistory(!showHistory)}
          className="glass px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2 hover:bg-white/5 transition-all"
        >
          <History className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold uppercase tracking-widest">{showHistory ? 'Store' : 'History'}</span>
        </button>
      </div>

      {showHistory ? (
        <div className="space-y-4 animate-in fade-in duration-300">
          <h4 className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1">Purchase History</h4>
          {state.purchaseHistory.length === 0 ? (
            <div className="py-20 text-center glass rounded-3xl border border-dashed border-white/10">
              <p className="text-slate-600 font-bold">No transactions found.</p>
            </div>
          ) : (
            state.purchaseHistory.slice().reverse().map((entry: any) => {
              const item = STORE_ITEMS.find(i => i.id === entry.itemId);
              return (
                <div key={entry.id} className="glass p-5 rounded-[24px] flex items-center justify-between border border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-500 border border-white/5">
                      {item?.badge ? <Crown className="w-5 h-5 text-purple-400" /> : <Gem className="w-5 h-5 text-slate-500" />}
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">{item?.name || 'Unknown Item'}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">{new Date(entry.timestamp).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-white">${entry.amount.toFixed(2)}</p>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${entry.status === 'paid' ? 'text-teal-400' : 'text-yellow-500'}`}>
                      {entry.status}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {STORE_ITEMS.map((item) => (
            <div 
              key={item.id} 
              className={`relative glass rounded-[32px] p-6 border transition-all duration-300 group hover:border-white/20 overflow-hidden ${
                item.isPopular ? 'border-purple-500/30 ring-1 ring-purple-500/20' : 'border-white/10'
              }`}
            >
              <div className="flex gap-5">
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 border border-white/5 bg-white/5 text-slate-400`}>
                  {item.price > 40 ? <Crown className="w-10 h-10" /> : <Gem className="w-10 h-10" />}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <h3 className="font-black text-xl text-white truncate tracking-tight">{item.name}</h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-6 font-medium">{item.description}</p>
                  
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col items-start">
                      <span className="text-2xl font-black text-white leading-tight">{item.echoAmount?.toLocaleString()} <span className="text-xs text-slate-500">ECHO</span></span>
                    </div>
                    <button 
                      onClick={() => handleStartPurchase(item)}
                      disabled={!!processingId}
                      className="h-12 px-6 bg-white text-slate-900 rounded-[16px] font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                    >
                      {processingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : `$${item.price.toFixed(2)}`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StoreTab;
