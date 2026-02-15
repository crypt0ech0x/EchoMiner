
import React, { useState, useRef, useEffect } from 'react';
import { AppState, NotificationType, LedgerEntry } from '../lib/types';
import { EchoAPI } from '../lib/api';
import { 
  X, Users, History, Settings, LogOut, Twitter, MessageSquare, 
  Globe, Download, ShieldAlert, Zap, ArrowLeft, Copy, ExternalLink, 
  ChevronRight, Bell, Moon, HelpCircle, FileText, CheckCircle2,
  BarChart3, Activity, PieChart, TrendingUp, Target, Camera, Loader2, Edit3, Check, Mail, Clock, Trash2, 
  Share2, Trophy, Coins, Calendar, ArrowUpRight, Plus, PlayCircle
} from 'lucide-react';

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onUpdateUser?: (newState: AppState) => void;
  initialView?: DrawerSubView;
}

export type DrawerSubView = 'main' | 'referral' | 'history' | 'settings' | 'analytics' | 'notifications';

const ProfileDrawer: React.FC<ProfileDrawerProps> = ({ isOpen, onClose, state, onUpdateUser, initialView = 'main' }) => {
  const [subView, setSubView] = useState<DrawerSubView>(initialView);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(state.user.username);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState(state.user.email || '');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSubView(initialView);
  }, [initialView, isOpen]);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      const csv = await EchoAPI.getSnapshotCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `echo_snapshot_${Date.now()}.csv`;
      a.click();
    } catch (err) {
      alert("Snapshot export failed.");
    }
  };

  const copyReferral = () => {
    const link = `https://echominer.io/join/${state.user.referralCode}`;
    navigator.clipboard.writeText(link);
    alert("Referral link copied!");
  };

  const handlePFPClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Image must be smaller than 2MB."); return; }
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      try {
        const newState = await EchoAPI.updateProfile({ pfpUrl: base64 });
        if (onUpdateUser) onUpdateUser(newState);
      } catch (err) { alert("Failed to update profile picture."); } finally { setIsUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveUsername = async () => {
    if (newUsername.trim() === state.user.username) { setIsEditingUsername(false); setUsernameError(null); return; }
    setIsSavingUsername(true); setUsernameError(null);
    try {
        const newState = await EchoAPI.updateProfile({ username: newUsername });
        if (onUpdateUser) onUpdateUser(newState);
        setIsEditingUsername(false);
    } catch (err: any) { setUsernameError(err.message || "Failed to update username."); } finally { setIsSavingUsername(false); }
  };

  const handleVerifyEmail = async () => {
    if (!emailInput.includes('@')) { alert("Invalid email."); return; }
    setIsVerifyingEmail(true);
    try {
      const newState = await EchoAPI.verifyEmail(emailInput);
      if (onUpdateUser) onUpdateUser(newState);
      alert("Email verified successfully!");
    } catch (err) {
      alert("Verification failed.");
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  const handleTogglePreference = async (type: NotificationType) => {
    const newPrefs = { ...state.user.notificationPreferences, [type]: !state.user.notificationPreferences[type] };
    const newState = await EchoAPI.updateNotificationPreferences(newPrefs);
    if (onUpdateUser) onUpdateUser(newState);
  };

  const handleMarkAsRead = async (id: string) => {
    const newState = await EchoAPI.handleNotifications('read', id);
    if (onUpdateUser) onUpdateUser(newState);
  };

  const handleMarkAllRead = async () => {
    const newState = await EchoAPI.handleNotifications('readAll');
    if (onUpdateUser) onUpdateUser(newState);
  };

  const handleClearNotifications = async () => {
    const newState = await EchoAPI.handleNotifications('clear');
    if (onUpdateUser) onUpdateUser(newState);
  };

  const getAnalytics = () => {
    const hourlyRate = state.session.effectiveRate * 3600;
    const dailyProjected = hourlyRate * 24;
    const monthlyProjected = dailyProjected * 30;
    const sourceBreakdown = state.ledger.reduce((acc, entry) => {
      if (entry.reason === 'session_settlement') acc.mined += entry.deltaEcho;
      if (entry.reason === 'purchase_topup') acc.purchased += entry.deltaEcho;
      if (entry.reason === 'referral_bonus') acc.referral += entry.deltaEcho;
      return acc;
    }, { mined: 0, purchased: 0, referral: 0 });
    const totalInflow = sourceBreakdown.mined + sourceBreakdown.purchased + sourceBreakdown.referral;
    return { 
      dailyProjected, monthlyProjected, 
      sourceBreakdown,
      minedPercent: totalInflow > 0 ? (sourceBreakdown.mined / totalInflow) * 100 : 0,
      purchasedPercent: totalInflow > 0 ? (sourceBreakdown.purchased / totalInflow) * 100 : 0,
      referralPercent: totalInflow > 0 ? (sourceBreakdown.referral / totalInflow) * 100 : 0,
      totalSessions: state.ledger.filter(l => l.reason === 'session_settlement').length
    };
  };

  const analyticsStats = getAnalytics();

  const renderAnalyticsView = () => (
    <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-8 no-scrollbar animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="grid grid-cols-1 gap-4">
        <div className="glass p-6 rounded-[24px] border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <TrendingUp className="w-16 h-16 text-teal-400" />
          </div>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Daily Potential</p>
          <div className="flex items-baseline gap-2">
            <h4 className="text-3xl font-black text-white tabular-nums tracking-tighter">
              {analyticsStats.dailyProjected.toFixed(2)}
            </h4>
            <span className="text-xs font-black text-teal-400">ECHO</span>
          </div>
          <div className="mt-4 flex items-center gap-2">
             <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-teal-400 transition-all duration-1000" style={{ width: '70%' }} />
             </div>
             <span className="text-[9px] font-black text-teal-400 uppercase tracking-widest">Active Rate</span>
          </div>
        </div>

        <div className="glass p-6 rounded-[24px] border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Calendar className="w-16 h-16 text-purple-400" />
          </div>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Monthly Forecast</p>
          <div className="flex items-baseline gap-2">
            <h4 className="text-3xl font-black text-white tabular-nums tracking-tighter">
              {analyticsStats.monthlyProjected.toFixed(2)}
            </h4>
            <span className="text-xs font-black text-purple-400">ECHO</span>
          </div>
          <p className="text-[10px] text-slate-500 font-bold mt-2 uppercase tracking-tighter italic">Based on current network efficiency</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between ml-1">
          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Income Breakdown</h4>
          {state.user.referrals > 0 && (
             <span className="bg-teal-400/10 text-teal-400 text-[8px] font-black px-1.5 py-0.5 rounded border border-teal-400/20 uppercase tracking-widest">+{state.user.referrals * 25}% Network Boost</span>
          )}
        </div>
        <div className="space-y-5 p-6 glass rounded-[32px] border border-white/5">
           {[
             { label: 'Direct Mining', val: analyticsStats.minedPercent, color: 'bg-teal-400', amount: analyticsStats.sourceBreakdown.mined },
             { label: 'Network Bonuses', val: analyticsStats.referralPercent, color: 'bg-purple-500', amount: analyticsStats.sourceBreakdown.referral },
             { label: 'ECHO Top-ups', val: analyticsStats.purchasedPercent, color: 'bg-indigo-400', amount: analyticsStats.sourceBreakdown.purchased },
           ].map((item, i) => (
             <div key={i} className="space-y-2">
               <div className="flex justify-between items-center">
                 <span className="text-[10px] font-black text-slate-300 uppercase tracking-tight">{item.label}</span>
                 <span className="text-[10px] font-black text-white">{item.amount.toFixed(4)} ECHO</span>
               </div>
               <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/5 p-[2px]">
                 <div className={`h-full rounded-full transition-all duration-1000 ${item.color}`} style={{ width: `${Math.max(item.val, 2)}%` }} />
               </div>
             </div>
           ))}
        </div>
      </div>
    </div>
  );

  const renderReferralView = () => (
    <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-8 no-scrollbar animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 bg-gradient-to-br from-teal-400 to-indigo-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-teal-500/20">
          <Users className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-xl font-black text-white tracking-tight">Expand Your Network</h3>
        <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-[240px] mx-auto">
          Earn <span className="text-teal-400 font-black">+25% PER FRIEND</span> extra mining speed for every explorer you invite.
        </p>
      </div>

      <div className="glass p-6 rounded-[32px] border border-white/10 space-y-6">
        <div className="space-y-2">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Your Invitation Hash</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-14 bg-black/40 border border-white/10 rounded-2xl flex items-center px-4 font-mono font-black text-lg text-teal-400 tracking-tighter">
              {state.user.referralCode}
            </div>
            <button onClick={copyReferral} className="w-14 h-14 glass border border-white/10 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-colors active:scale-90">
              <Copy className="w-5 h-5" />
            </button>
          </div>
        </div>

        <button onClick={copyReferral} className="w-full h-14 bg-white text-slate-950 rounded-2xl font-black text-xs uppercase tracking-[0.15em] flex items-center justify-center gap-2 hover:bg-slate-200 transition-all active:scale-95">
          <Share2 className="w-4 h-4" /> Share Link
        </button>
      </div>
    </div>
  );

  const renderHistoryView = () => (
    <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-6 no-scrollbar animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center justify-between sticky top-0 bg-[#020617]/80 backdrop-blur-xl py-4 z-10">
        <h3 className="text-lg font-black text-white tracking-tight">System Ledger</h3>
        <button onClick={handleExport} className="text-[9px] font-black text-purple-400 uppercase tracking-widest hover:text-purple-300 flex items-center gap-1.5 bg-purple-400/10 px-3 py-1.5 rounded-lg border border-purple-400/20">
          <Download className="w-3 h-3" /> Export CSV
        </button>
      </div>

      {state.ledger.length === 0 ? (
        <div className="py-20 text-center glass rounded-3xl border border-dashed border-white/10">
          <History className="w-10 h-10 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-600 font-bold text-sm">Waiting for first block settlement.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {state.ledger.slice().reverse().map((entry: LedgerEntry) => {
            const isEvent = entry.deltaEcho === 0;
            return (
              <div key={entry.id} className="glass p-5 rounded-2xl border border-white/5 transition-all hover:bg-white/[0.06] group">
                <div className="flex gap-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-white/5 ${
                    entry.reason === 'session_settlement' ? 'bg-teal-500/10 text-teal-400' :
                    entry.reason === 'referral_bonus' ? 'bg-purple-500/10 text-purple-400' :
                    entry.reason === 'session_start' ? 'bg-slate-500/10 text-slate-400' :
                    entry.reason === 'boost_activation' ? 'bg-cyan-500/10 text-cyan-400' :
                    'bg-orange-500/10 text-orange-400'
                  }`}>
                    {entry.reason === 'session_settlement' ? <Clock className="w-5 h-5" /> : 
                     entry.reason === 'referral_bonus' ? <Users className="w-5 h-5" /> : 
                     entry.reason === 'session_start' ? <PlayCircle className="w-5 h-5" /> :
                     entry.reason === 'boost_activation' ? <Zap className="w-5 h-5 fill-cyan-400/20" /> :
                     <Coins className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[13px] font-black text-white uppercase tracking-tight">
                        {entry.reason.split('_').join(' ')}
                      </p>
                      <div className={`flex items-center gap-1 ${isEvent ? 'text-slate-500' : 'text-teal-400'}`}>
                        {!isEvent && <Plus className="w-3 h-3" />}
                        <span className="text-sm font-black tabular-nums">
                          {isEvent ? 'EVENT' : entry.deltaEcho.toFixed(6)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderMainView = () => (
    <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-8 no-scrollbar animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-4 group cursor-pointer" onClick={handlePFPClick}>
          <div className={`w-28 h-28 rounded-full p-1 shadow-2xl transition-transform group-active:scale-95 ${state.user.priorityAirdrop ? 'bg-gradient-to-tr from-yellow-400 via-purple-500 to-teal-400 animate-spin-slow' : 'bg-white/10 shadow-black/40'}`}>
            <div className="w-full h-full rounded-full relative overflow-hidden bg-[#020617] p-1">
              <img 
                src={state.user.pfpUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${state.user.id}&backgroundColor=0f172a`} 
                className={`w-full h-full rounded-full object-cover transition-opacity ${isUploading ? 'opacity-30' : 'opacity-100'}`}
                alt="Voyager"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                {isUploading ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Camera className="w-6 h-6 text-white" />}
              </div>
            </div>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
        </div>
        
        <div className="flex flex-col items-center w-full">
          {isEditingUsername ? (
            <div className="w-full space-y-2">
                <div className="relative flex items-center">
                    <input autoFocus type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-black text-center focus:outline-none focus:border-purple-500" placeholder="Enter username" onKeyDown={(e) => e.key === 'Enter' && handleSaveUsername()} />
                    <button disabled={isSavingUsername} onClick={handleSaveUsername} className="absolute right-2 w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center text-white">
                        {isSavingUsername ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                </div>
                {usernameError && <p className="text-[10px] text-red-400 font-bold uppercase tracking-tight">{usernameError}</p>}
            </div>
          ) : (
            <button onClick={() => setIsEditingUsername(true)} className="flex items-center gap-2 group">
                <h3 className="text-xl font-black text-white group-hover:text-purple-400 transition-colors">{state.user.username}</h3>
                <Edit3 className="w-4 h-4 text-slate-600 group-hover:text-purple-400 transition-colors" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {[
          { label: 'Mining Analytics', icon: BarChart3, sub: 'Performance & Projections', view: 'analytics' },
          { label: 'Referral Program', icon: Users, sub: 'Earn +25% per friend', view: 'referral' },
          { label: 'Notifications', icon: Bell, sub: 'Manage alerts', view: 'notifications' },
          { label: 'Mining History', icon: History, sub: 'Daily logs & earnings', view: 'history' },
          { label: 'Settings', icon: Settings, sub: 'Security & preferences', view: 'settings' },
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <button key={idx} onClick={() => setSubView(item.view as DrawerSubView)} className="w-full p-4 flex items-center gap-4 rounded-2xl hover:bg-white/5 transition-colors text-left group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-500 group-hover:text-white transition-colors border border-white/5 relative">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-white">{item.label}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">{item.sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderNotificationsView = () => (
    <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-6 no-scrollbar animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center justify-between sticky top-0 bg-[#020617]/80 backdrop-blur-xl py-4 z-10">
        <h3 className="text-lg font-black text-white tracking-tight">Alert Center</h3>
        <div className="flex gap-2">
          <button onClick={handleMarkAllRead} className="text-[9px] font-black text-teal-400 uppercase tracking-widest hover:text-teal-300">Read All</button>
          <span className="text-white/10">|</span>
          <button onClick={handleClearNotifications} className="text-[9px] font-black text-red-400 uppercase tracking-widest hover:text-red-300">Clear</button>
        </div>
      </div>

      {state.notifications.length === 0 ? (
        <div className="py-20 text-center glass rounded-3xl border border-dashed border-white/10">
          <Bell className="w-10 h-10 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-600 font-bold text-sm">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {state.notifications.map((notif) => {
            const isUnread = !notif.readAt;
            return (
              <div 
                key={notif.id} 
                onClick={() => handleMarkAsRead(notif.id)}
                className={`glass p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${isUnread ? 'border-purple-500/30 bg-purple-500/5 ring-1 ring-purple-500/10' : 'border-white/5 opacity-70'}`}
              >
                {isUnread && <div className="absolute top-0 left-0 w-1 h-full bg-purple-500" />}
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-black text-white truncate">{notif.title}</p>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-medium">{notif.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderSettingsView = () => (
    <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-8 no-scrollbar animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="space-y-4">
        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email Verification</h4>
        <div className={`glass rounded-2xl p-5 border ${state.user.emailVerified ? 'border-teal-500/20' : 'border-white/10'} space-y-4`}>
          <input 
            type="email" 
            value={emailInput} 
            onChange={(e) => setEmailInput(e.target.value)} 
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white focus:outline-none focus:border-teal-500" 
            placeholder="voyager@echo.io"
          />
          <button 
            onClick={handleVerifyEmail}
            disabled={isVerifyingEmail || state.user.emailVerified}
            className="w-full h-10 bg-teal-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isVerifyingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : state.user.emailVerified ? 'Verified' : 'Verify Address'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Notification Preferences</h4>
        <div className="space-y-3">
          {[
            { id: 'session_end', label: 'Mining Completion' },
            { id: 'streak_grace_warning', label: 'Streak Grace Warning' },
            { id: 'boost_expired', label: 'Boost Expired' },
            { id: 'airdrop_announcement', label: 'Project Updates' },
          ].map((opt) => (
            <div key={opt.id} className="flex items-center justify-between p-4 glass rounded-2xl border border-white/5">
              <span className="text-sm font-black text-white">{opt.label}</span>
              <button 
                onClick={() => handleTogglePreference(opt.id as NotificationType)}
                className={`w-10 h-5 rounded-full relative p-1 transition-colors ${state.user.notificationPreferences[opt.id as NotificationType] ? 'bg-teal-500' : 'bg-slate-800'}`}
              >
                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${state.user.notificationPreferences[opt.id as NotificationType] ? 'translate-x-5' : 'translate-x-0'}`}></div>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const unreadCount = state.notifications.filter(n => !n.readAt).length;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />
      <div className="relative w-[85%] max-w-sm h-full glass border-l border-white/10 animate-in slide-in-from-right duration-300 flex flex-col shadow-2xl">
        <div className="p-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            {subView !== 'main' && (
              <button onClick={() => setSubView('main')} className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-2xl font-black text-white tracking-tight uppercase tracking-widest">Account</h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {subView === 'main' && renderMainView()}
        {subView === 'notifications' && renderNotificationsView()}
        {subView === 'settings' && renderSettingsView()}
        {subView === 'analytics' && renderAnalyticsView()}
        {subView === 'referral' && renderReferralView()} 
        {subView === 'history' && renderHistoryView()}

        <div className="p-8 border-t border-white/10 shrink-0">
          <button onClick={onClose} className="w-full h-14 glass border border-red-500/10 text-red-500/60 rounded-2xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest hover:bg-red-500/5 hover:text-red-500 transition-colors">
            <LogOut className="w-4 h-4" /> Close Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileDrawer;
