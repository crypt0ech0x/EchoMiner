
import React, { useState } from 'react';
import { AppState, StoreItem } from '../types';
import { AuthoritativeServer } from '../server';
import { STORE_ITEMS } from '../constants';
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
      // 1. Create Stripe Session on Server
      const sessionId = await AuthoritativeServer.createStripeSession(item.id);
      
      // 2. Simulate User Redirect to Stripe & Success Return
      console.log(`Redirecting to Stripe: ${sessionId}...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 3. Simulate Webhook receiving success
      const newState = await AuthoritativeServer.handleStripeWebhook(sessionId);
      onPurchase(newState);
      alert(`Payment Successful! ${item.name} has been activated.`);
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
            state.purchaseHistory.slice().reverse().map((entry) => {
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
              {item.isPopular && (
                <div className="absolute top-0 right-0 bg-purple-600 text-white text-[10px] font-black px-4 py-1.5 rounded-bl-2xl uppercase tracking-tighter">
                  Most Popular
                </div>
              )}
              
              <div className="flex gap-5">
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 border border-white/5 ${
                  item.price > 20 ? 'bg-gradient-to-br from-indigo-600/20 to-purple-600/20 text-indigo-400' : 'bg-white/5 text-slate-400'
                }`}>
                  {item.price > 40 ? <Crown className="w-10 h-10" /> : <Gem className="w-10 h-10" />}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <h3 className="font-black text-xl text-white truncate tracking-tight">{item.name}</h3>
                    {item.badge && (
                      <span className="bg-teal-400/10 text-teal-400 text-[10px] font-black px-2 py-0.5 rounded border border-teal-400/20 uppercase">
                        {item.badge}
                      </span>
                    )}
                    {item.id === 'resonance_echo' && (
                      <div className="flex items-center gap-1 bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/20">
                        <Zap className="w-2.5 h-2.5 text-purple-400 fill-purple-400" />
                        <span className="text-[9px] text-purple-300 font-black uppercase tracking-tight">Priority Airdrop</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-6 font-medium">{item.description}</p>
                  
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col items-start">
                      <span className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] mb-1">Package Yield</span>
                      <span className="text-2xl font-black text-white leading-tight">{item.echoAmount?.toLocaleString()} <span className="text-xs text-slate-500">ECHO</span></span>
                    </div>
                    <div className="flex flex-col items-center gap-2 flex-1 max-w-[140px]">
                      <button 
                        onClick={() => handleStartPurchase(item)}
                        disabled={!!processingId}
                        className="w-full h-14 bg-white text-slate-900 rounded-[20px] font-black uppercase tracking-widest text-sm hover:bg-slate-200 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                      >
                        {processingId === item.id ? <Loader2 className="w-5 h-5 animate-spin" /> : `$${item.price.toFixed(2)}`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 pt-5 border-t border-white/5 flex gap-4 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-2 shrink-0">
                  <Check className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Authoritative Settle</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Check className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Stripe Secured</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!showHistory && (
        <button className="w-full py-6 flex items-center justify-center gap-2 text-[11px] font-black text-slate-600 uppercase tracking-[0.2em] hover:text-slate-400 transition-colors border-t border-white/5">
          Restore Purchases <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default StoreTab;
