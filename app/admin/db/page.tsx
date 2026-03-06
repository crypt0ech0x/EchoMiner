"use client";

import React, { useEffect, useMemo, useState } from "react";

type Row = {
  userId: string;
  walletAddress: string | null;
  walletVerified: boolean;
  walletVerifiedAt: string | null;

  totalMinedEcho: number;
  totalPurchasedEcho: number;
  totalEcho: number;

  sessionIsActive: boolean;
  sessionStartedAt: string | null;
  sessionLastAccruedAt: string | null;
  sessionMined: number;
  baseRatePerHr: number;
  multiplier: number;
  effectiveRatePerSec: number;

  firstMiningAt: string | null;
  lastMiningAt: string | null;
  lastSessionEndedAt: string | null;
  lastSessionMined: number | null;

  createdAt: string;
};

type Totals = {
  wallets: number;
  activeSessions: number;
  totalMinedEcho: number;
  totalPurchasedEcho: number;
  totalEcho: number;
};

type OverviewResponse =
  | {
      ok: true;
      generatedAt: string;
      totals: Totals;
      rows: Row[];
    }
  | {
      ok: false;
      error: string;
    };

function fmt(n: number, digits = 6) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function shortAddr(addr: string | null) {
  if (!addr) return "—";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

export default function AdminDbPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const POLL_MS = 2000;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/admin/overview", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (res.status === 401) {
        setErr("Not logged in");
        setRows([]);
        setTotals(null);
        setGeneratedAt(null);
        return;
      }

      const data = (await res.json()) as OverviewResponse;

      if (!data || data.ok !== true) {
        setErr((data as any)?.error || "Admin overview failed");
        setRows([]);
        setTotals(null);
        setGeneratedAt(null);
        return;
      }

      setErr(null);
      setRows(data.rows);
      setTotals(data.totals);
      setGeneratedAt(data.generatedAt);
    } catch (e: any) {
      setErr(e?.message || "Admin overview failed");
      setRows([]);
      setTotals(null);
      setGeneratedAt(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const liveRows = useMemo(() => {
    return rows.map((r) => {
      if (!r.sessionIsActive || !r.sessionLastAccruedAt || r.effectiveRatePerSec <= 0) {
        return {
          ...r,
          liveSessionMining: r.sessionMined,
        };
      }

      const last = new Date(r.sessionLastAccruedAt).getTime();
      const deltaSec = Math.max(0, (now - last) / 1000);
      const liveSessionMining = r.sessionMined + deltaSec * r.effectiveRatePerSec;

      return {
        ...r,
        liveSessionMining,
      };
    });
  }, [rows, now]);

  const displayTotals = useMemo(() => {
    const activeLive = liveRows.filter((r) => r.sessionIsActive).length;
    return {
      wallets: totals?.wallets ?? liveRows.length,
      activeSessions: activeLive,
      totalMinedEcho: totals?.totalMinedEcho ?? 0,
      totalPurchasedEcho: totals?.totalPurchasedEcho ?? 0,
      totalEcho: totals?.totalEcho ?? 0,
    };
  }, [totals, liveRows]);

  return (
    <div className="min-h-screen bg-background text-white px-5 py-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Admin DB</h1>
            <p className="text-white/50 text-sm">
              Live session mining for every wallet
            </p>
            <p className="text-white/30 text-xs mt-1">
              Last API update: {generatedAt ? fmtDate(generatedAt) : "—"} • Polling every {POLL_MS / 1000}s
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => load()}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 font-bold text-sm"
            >
              Refresh
            </button>

            <button
              onClick={() => {
                window.location.href = "/api/admin/overview?redirect=/admin/db";
              }}
              className="px-4 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/25 border border-teal-500/30 font-black text-sm"
            >
              Authenticate
            </button>
          </div>
        </div>

        {err && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <div className="font-black text-red-200">Admin overview failed</div>
            <div className="text-sm text-red-100/80 mt-1">{err}</div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/50 font-black">Wallets</div>
            <div className="text-xl font-black">{displayTotals.wallets}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/50 font-black">Active Sessions</div>
            <div className="text-xl font-black">{displayTotals.activeSessions}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/50 font-black">Total Mined</div>
            <div className="text-xl font-black">{fmt(displayTotals.totalMinedEcho)}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/50 font-black">Purchased</div>
            <div className="text-xl font-black">{fmt(displayTotals.totalPurchasedEcho)}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/50 font-black">Total Echo</div>
            <div className="text-xl font-black">{fmt(displayTotals.totalEcho)}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="font-black tracking-tight">Wallet Sessions</div>
            {loading && <div className="text-white/50 text-xs font-mono">loading…</div>}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1300px] w-full text-sm">
              <thead className="bg-white/[0.03]">
                <tr className="text-left">
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Wallet</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Live Session Mining</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Session Mined (DB)</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Rate / sec</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Active</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Total Mined</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">First Session</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Most Recent</th>
                </tr>
              </thead>

              <tbody>
                {liveRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-white/50" colSpan={8}>
                      No rows (or not authenticated yet).
                    </td>
                  </tr>
                ) : (
                  liveRows.map((r) => (
                    <tr key={r.userId} className="border-t border-white/5">
                      <td className="px-4 py-3 font-mono text-xs">
                        <span title={r.walletAddress ?? ""}>{shortAddr(r.walletAddress)}</span>
                      </td>

                      <td className="px-4 py-3 font-black tabular-nums text-teal-300">
                        {fmt(r.liveSessionMining || 0)}
                      </td>

                      <td className="px-4 py-3 font-black tabular-nums">
                        {fmt(r.sessionMined || 0)}
                      </td>

                      <td className="px-4 py-3 font-mono text-xs">
                        {fmt(r.effectiveRatePerSec || 0, 8)}
                      </td>

                      <td className="px-4 py-3">
                        {r.sessionIsActive ? (
                          <span className="px-2 py-1 rounded-lg bg-teal-400/15 border border-teal-400/20 text-teal-300 text-xs font-black">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/40 text-xs font-black">
                            INACTIVE
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-black tabular-nums">
                        {fmt(r.totalMinedEcho || 0)}
                      </td>

                      <td className="px-4 py-3 text-white/70">{fmtDate(r.firstMiningAt)}</td>
                      <td className="px-4 py-3 text-white/70">{fmtDate(r.lastMiningAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-white/10 text-[11px] text-white/40">
            Live Session Mining mirrors the Mine home screen formula:
            sessionMined + ((now - lastAccruedAt) * effectiveRatePerSec).
          </div>
        </div>
      </div>
    </div>
  );
}