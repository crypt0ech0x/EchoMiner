"use client";

import React, { useEffect, useMemo, useState } from "react";

type Row = {
  userId: string;
  createdAt: string;
  walletAddress: string | null;
  walletVerified: boolean;
  totalPurchasedEcho: number;
  totalMinedEcho: number;
  totalEcho: number;
  mostRecentMiningSessionAt: string | null;
};

export default function AdminDbPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Request failed");
      setRows(data.rows ?? []);
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.purchased += Number(r.totalPurchasedEcho || 0);
        acc.mined += Number(r.totalMinedEcho || 0);
        acc.total += Number(r.totalEcho || 0);
        return acc;
      },
      { purchased: 0, mined: 0, total: 0 }
    );
  }, [rows]);

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black">Admin DB Overview</h1>
          <p className="text-white/50 text-sm">Wallet + totals (mined/purchased/total)</p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 font-bold text-sm"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 font-bold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Stat label="Total Purchased" value={totals.purchased} />
        <Stat label="Total Mined" value={totals.mined} />
        <Stat label="Total ECHO" value={totals.total} />
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden">
        <div className="bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-widest text-white/60">
          {loading ? "Loading…" : `${rows.length} users`}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-white/5 text-white/60">
              <tr>
                <th className="text-left px-4 py-3">Wallet</th>
                <th className="text-left px-4 py-3">Verified</th>
                <th className="text-right px-4 py-3">Purchased</th>
                <th className="text-right px-4 py-3">Mined</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Last Mining</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-t border-white/10 hover:bg-white/[0.04]">
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.walletAddress ? truncate(r.walletAddress, 10) : <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-black px-2 py-1 rounded-lg border ${
                        r.walletVerified
                          ? "bg-teal-500/10 text-teal-300 border-teal-500/20"
                          : "bg-white/5 text-white/40 border-white/10"
                      }`}
                    >
                      {r.walletVerified ? "VERIFIED" : "NO"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(r.totalPurchasedEcho).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(r.totalMinedEcho).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-black">{Number(r.totalEcho).toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-white/60">
                    {r.mostRecentMiningSessionAt ? new Date(r.mostRecentMiningSessionAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-white/40 font-bold">
                    No users yet.
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-white/50">{label}</div>
      <div className="text-2xl font-black tabular-nums">{value.toFixed(2)}</div>
    </div>
  );
}

function truncate(s: string, keep = 6) {
  if (s.length <= keep * 2) return s;
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}