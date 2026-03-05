// app/admin/db/page.tsx
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

  firstMiningAt: string | null;
  lastMiningAt: string | null;
  totalSessions: number;
};

function shortAddr(addr: string) {
  return addr.length <= 12 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function AdminDbPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");

  async function load() {
    try {
      setErr(null);
      const res = await fetch("/api/admin/overview", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || `${res.status} ${res.statusText}`);
      }

      if (!data?.ok) throw new Error(data?.error || "Unknown error");

      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e: any) {
      setErr(e?.message || "Admin overview failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // “real-time enough”
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      return (
        r.userId.toLowerCase().includes(term) ||
        (r.walletAddress ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, q]);

  return (
    <div className="min-h-screen bg-[#020617] text-white p-5">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Admin DB</h1>
            <p className="text-white/50 text-sm">
              Wallet + mining summary (auto-refreshes every 5s)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search userId or wallet..."
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none w-64"
            />
            <button
              onClick={load}
              className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-sm font-bold hover:bg-white/15"
            >
              Refresh
            </button>
          </div>
        </div>

        {err && (
          <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10">
            <div className="font-black">Admin overview failed</div>
            <div className="text-sm text-white/70">{err}</div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="bg-white/5 px-4 py-3 flex items-center justify-between">
            <div className="text-sm font-black text-white/80">
              {loading ? "Loading…" : `${filtered.length} users`}
            </div>
            <div className="text-xs text-white/40">No purchases yet (redacted)</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-black/30 text-white/60">
                <tr>
                  <th className="text-left px-4 py-3 font-black">Wallet</th>
                  <th className="text-left px-4 py-3 font-black">Verified</th>
                  <th className="text-right px-4 py-3 font-black">Mined</th>
                  <th className="text-right px-4 py-3 font-black">Purchased</th>
                  <th className="text-right px-4 py-3 font-black">Total</th>
                  <th className="text-left px-4 py-3 font-black">First session</th>
                  <th className="text-left px-4 py-3 font-black">Latest session</th>
                  <th className="text-right px-4 py-3 font-black">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.userId} className="border-t border-white/10 hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-mono">
                      {r.walletAddress ? shortAddr(r.walletAddress) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.walletVerified ? (
                        <span className="text-teal-300 font-black">
                          Yes <span className="text-white/40 font-normal">({fmtDate(r.walletVerifiedAt)})</span>
                        </span>
                      ) : (
                        <span className="text-white/40">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {Number(r.totalMinedEcho ?? 0).toFixed(6)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/50">
                      {Number(r.totalPurchasedEcho ?? 0).toFixed(6)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-black">
                      {Number(r.totalEcho ?? 0).toFixed(6)}
                    </td>
                    <td className="px-4 py-3 text-white/70">{fmtDate(r.firstMiningAt)}</td>
                    <td className="px-4 py-3 text-white/70">{fmtDate(r.lastMiningAt)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.totalSessions ?? 0}</td>
                  </tr>
                ))}

                {!loading && filtered.length === 0 && (
                  <tr>
                    <td className="px-4 py-10 text-center text-white/50" colSpan={8}>
                      No users match your search.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td className="px-4 py-10 text-center text-white/50" colSpan={8}>
                      Loading…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-black/20 px-4 py-3 text-xs text-white/40">
            Tip: keep this open while testing wallets — it will update automatically.
          </div>
        </div>
      </div>
    </div>
  );
}