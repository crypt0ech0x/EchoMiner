"use client";

import React, { useEffect, useState } from "react";

type Overview = {
  ok: boolean;
  error?: string;

  // shape this to whatever your route returns:
  totals?: {
    users: number;
    totalMinedEcho: number;
    activeSessions: number;
  };

  rows?: Array<{
    userId: string;
    walletAddress: string | null;
    totalMinedEcho: number;
    sessionIsActive: boolean;
    sessionMined: number;
    lastAccruedAt: string | null;
    startedAt: string | null;
  }>;
};

async function fetchOverview(): Promise<Overview> {
  const res = await fetch("/api/admin/overview", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
    headers: { "Cache-Control": "no-store" },
  });

  const data = (await res.json().catch(() => null)) as Overview | null;

  if (!res.ok) {
    return { ok: false, error: data?.error || `${res.status}` };
  }
  return data ?? { ok: false, error: "Bad JSON" };
}

export default function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // poll interval (adjust: 2000–5000ms)
  const POLL_MS = 3000;

  useEffect(() => {
    let alive = true;
    let timer: any;

    const run = async () => {
      const d = await fetchOverview();
      if (!alive) return;

      if (!d.ok) {
        setErr(d.error || "Admin overview failed");
      } else {
        setErr(null);
      }
      setData(d);
      setLoading(false);

      timer = setTimeout(run, POLL_MS);
    };

    run();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (loading) {
    return (
      <div className="p-6 text-white/60 font-bold">
        Loading admin overview…
      </div>
    );
  }

  if (err) {
    return (
      <div className="p-6">
        <div className="text-red-400 font-black mb-2">Admin overview failed</div>
        <div className="text-white/60 text-sm">{err}</div>
        <div className="text-white/40 text-xs mt-3">
          If this says “Not logged in”, your admin auth cookie/env check is failing for this request.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="glass rounded-2xl p-4 border border-white/10">
        <div className="text-xs text-white/50 font-black uppercase tracking-widest">Totals</div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-[10px] text-white/40 font-bold">Users</div>
            <div className="text-xl text-white font-black">{data?.totals?.users ?? "-"}</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-[10px] text-white/40 font-bold">Total Mined</div>
            <div className="text-xl text-white font-black">{data?.totals?.totalMinedEcho ?? "-"}</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-[10px] text-white/40 font-bold">Active Sessions</div>
            <div className="text-xl text-white font-black">{data?.totals?.activeSessions ?? "-"}</div>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-4 text-xs text-white/50 font-black uppercase tracking-widest">
          Users (auto-refreshing every {POLL_MS / 1000}s)
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/40">
              <tr className="border-t border-white/10">
                <th className="text-left p-3">Wallet</th>
                <th className="text-right p-3">Total Mined</th>
                <th className="text-center p-3">Active</th>
                <th className="text-right p-3">Session Mined</th>
                <th className="text-right p-3">Last Accrued</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.userId} className="border-t border-white/10 text-white/80">
                  <td className="p-3 font-mono text-xs">{r.walletAddress ?? "-"}</td>
                  <td className="p-3 text-right font-black">{Number(r.totalMinedEcho ?? 0).toFixed(6)}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-1 rounded text-[10px] font-black ${r.sessionIsActive ? "bg-teal-400/20 text-teal-300" : "bg-white/10 text-white/50"}`}>
                      {r.sessionIsActive ? "YES" : "NO"}
                    </span>
                  </td>
                  <td className="p-3 text-right font-black">{Number(r.sessionMined ?? 0).toFixed(6)}</td>
                  <td className="p-3 text-right text-xs text-white/50">
                    {r.lastAccruedAt ? new Date(r.lastAccruedAt).toLocaleString() : "-"}
                  </td>
                </tr>
              ))}
              {(data?.rows ?? []).length === 0 && (
                <tr>
                  <td className="p-4 text-white/40" colSpan={5}>
                    No rows returned.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}