
import React, { useState } from 'react';
import { AppState } from '../types';
import { AuthoritativeServer } from '../authoritative-server';
import { Wallet, ShieldAlert, CheckCircle2, Copy, ExternalLink, ArrowRight, ShieldCheck, Key } from 'lucide-react';

interface WalletTabProps {
  state: AppState;
  onConnect: (newState: AppState) => void;
}

const WalletTab: React.FC<WalletTabProps> = ({ state, onConnect }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const isConnected = !!state.walletAddress;
  const isVerified = !!state.walletVerifiedAt;

  const handleConnectAndSign = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      // 1. Simulate Wallet Connection & Signing
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const mockAddress = "ECHO7k9u...sP2n8w";
      const mockSignature = "sig_" + btoa(`Link ECHO Miner account ${state.user.id} to wallet ${mockAddress}`);
      
      // In production, we'd use AuthoritativeServer methods here
      const newState = { ...state, walletAddress: mockAddress, walletVerifiedAt: Date.now() };
      onConnect(newState);
      await AuthoritativeServer.saveState(newState);
    } catch (err: any) {
      setError(err.message || "Failed to link wallet.");
    } finally {
      setIsConnecting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Address copied!");
  };

  return (
    <div className="px-6 space-y-6 animate-in slide-in-from-left duration-500">
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-white tracking-tight">Wallet</h2>
        <p className="text-slate-400 text-sm">Secure your ECHO for the mainnet airdrop.</p>
      </div>

      {/* Main Connection Card */}
      <div className="glass rounded-[32px] p-8 border border-white/10 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-purple-600/10 blur-[80px] -z-10"></div>
        
        {isConnected ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-3xl bg-teal-500/10 flex items-center justify-center text-teal-400 border border-teal-500/20 shadow-lg shadow-teal-500/10">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-white text-lg">Wallet Linked</h3>
                  <span className="bg-teal-400/20 text-teal-400 text-[10px] font-black px-2 py-0.5 rounded uppercase border border-teal-400/20">Verified</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs font-mono text-slate-500 truncate max-w-[120px]">{state.walletAddress}</span>
                  <button onClick={() => copyToClipboard(state.walletAddress!)} className="text-slate-600 hover:text-white transition-colors">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Snapshot Alloc</p>
                <p className="text-2xl font-black text-white tabular-nums">{state.user.totalMined.toFixed(2)}</p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Airdrop Readiness</p>
                <p className="text-2xl font-black text-teal-400">100%</p>
              </div>
            </div>

            <div className="space-y-3">
              <button className="w-full h-14 glass rounded-2xl text-xs font-bold text-slate-400 border border-white/10 flex items-center justify-center gap-2 hover:bg-white/5 transition-all">
                <ExternalLink className="w-4 h-4" />
                View On Explorer
              </button>
              <button disabled className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl text-xs font-black text-slate-600 uppercase tracking-widest cursor-not-allowed">
                Claims Launching Phase 3
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-8 border border-white/10 shadow-inner">
              <Wallet className="w-12 h-12 text-white/30" />
            </div>
            <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Connect & Verify</h3>
            <p className="text-sm text-slate-500 mb-10 max-w-[280px] leading-relaxed">
              We use <span className="text-white font-bold">cryptographic signatures</span> to link your account. Mined ECHO is stored off-chain until the TGE snapshot.
            </p>

            {error && (
              <div className="mb-6 w-full p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold">
                {error}
              </div>
            )}

            <button 
              onClick={handleConnectAndSign}
              disabled={isConnecting}
              className={`w-full h-16 rounded-[24px] text-white font-black uppercase tracking-widest shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 ${
                isConnecting ? 'bg-slate-800 animate-pulse' : 'bg-gradient-to-r from-purple-600 to-indigo-700 shadow-purple-600/30'
              }`}
            >
              {isConnecting ? (
                <>
                  <Key className="w-5 h-5 animate-spin" />
                  Signing Message...
                </>
              ) : (
                <>
                  <img src="https://cryptologos.cc/logos/solana-sol-logo.png" className="w-5 h-5 brightness-200" alt="SOL" />
                  Link Solana Wallet
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Snapshot Info */}
      <div className="glass rounded-[24px] p-6 border border-yellow-500/10 flex gap-4">
        <ShieldAlert className="w-6 h-6 text-yellow-500 shrink-0" />
        <div className="space-y-1">
          <h4 className="text-sm font-black text-yellow-500 uppercase tracking-tight">Pre-launch Protocol</h4>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">
            Your mined balance is a <span className="text-white">virtual accrual</span>. It will be snapshotted exactly 24h before token launch. Duplicate accounts or bot behavior will void eligibility.
          </p>
        </div>
      </div>

      {/* Eligibility Checklist */}
      <div className="space-y-4">
        <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">Eligibility Checklist</h4>
        <div className="space-y-3">
          <div className="glass p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className={`w-5 h-5 ${isVerified ? 'text-teal-400' : 'text-slate-600'}`} />
              <span className={`text-xs font-bold ${isVerified ? 'text-white' : 'text-slate-600'}`}>Wallet Verified</span>
            </div>
            {isVerified ? <CheckCircle2 className="w-4 h-4 text-teal-400" /> : <div className="w-4 h-4 rounded-full border border-slate-700" />}
          </div>
          <div className="glass p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-teal-400 w-5 h-5" />
              <span className="text-xs font-bold text-white">Minimum Balance ({'>'}0.01 ECHO)</span>
            </div>
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
          </div>
          <div className="glass p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-slate-600 w-5 h-5" />
              <span className="text-xs font-bold text-slate-600">KYC Verification (Phase 2)</span>
            </div>
            <div className="w-4 h-4 rounded-full border border-slate-700" />
          </div>
        </div>
      </div>
      
      <button className="w-full group py-6 flex items-center justify-between text-slate-500 hover:text-slate-300 transition-colors border-t border-white/5">
        <span className="text-xs font-black uppercase tracking-widest">Read Airdrop Terms</span>
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
      </button>
    </div>
  );
};

export default WalletTab;
