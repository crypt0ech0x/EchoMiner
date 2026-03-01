// app/admin/db/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type Row = {
  userId: string;
  walletAddress: string | null;
  walletVerified: boolean;
  totalMinedEcho: number;
  firstMiningSessionAt: string | null;
  lastMiningSessionAt: string | null;
};

export default function AdminDbPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/overview", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || `${res.status} ${res.statusText}`);
      }
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setErr(e?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) => (r.walletAddress ?? "").toLowerCase().includes(query));
  }, [rows, q]);

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Admin DB Overview</h1>
            <p className="text-white/50 text-sm">
              Wallet address • Total mined • First session • Most recent session
            </p>
          </div>
          <button
            onClick={load}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-sm font-bold"
          >
            Refresh
          </button>
        </div>

        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search wallet address…"
            className="w-full max-w-md px-4 py-2 rounded-xl bg-black/40 border border-white/10 outline-none focus:border-purple-500"
          />
          <div className="text-xs text-white/50">
            {filtered.length}/{rows.length}
          </div>
        </div>

        {loading && (
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 animate-pulse">
            Loading…
          </div>
        )}

        {err && (
          <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300">
            <div className="font-black mb-1">Admin overview failed</div>
            <div className="text-sm opacity-90">{err}</div>
          </div>
        )}

        {!loading && !err && (
          <div className="rounded-2xl overflow-hidden border border-white/10">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-white/70">
                  <tr>
                    <th className="text-left p-3">Wallet</th>
                    <th className="text-left p-3">Verified</th>
                    <th className="text-right p-3">Total Mined</th>
                    <th className="text-left p-3">First Session</th>
                    <th className="text-left p-3">Most Recent</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.userId} className="border-t border-white/10">
                      <td className="p-3 font-mono text-xs">
                        {r.walletAddress ?? <span className="text-white/30">—</span>}
                      </td>
                      <td className="p-3">
                        {r.walletVerified ? (
                          <span className="px-2 py-1 rounded-lg bg-teal-400/15 text-teal-300 border border-teal-400/20 text-xs font-black">
                            VERIFIED
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-lg bg-white/5 text-white/40 border border-white/10 text-xs font-black">
                            NO
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums font-black">
                        {Number(r.totalMinedEcho ?? 0).toFixed(6)}
                      </td>
                      <td className="p-3 text-white/70">
                        {r.firstMiningSessionAt
                          ? new Date(r.firstMiningSessionAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="p-3 text-white/70">
                        {r.lastMiningSessionAt
                          ? new Date(r.lastMiningSessionAt).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}

                  {filtered.length === 0 && (
                    <tr>
                      <td className="p-6 text-white/40" colSpan={5}>
                        No results.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="text-xs text-white/35">
          Purchases are currently redacted (not queried / not displayed).
        </div>
      </div>
    </div>
  );
}