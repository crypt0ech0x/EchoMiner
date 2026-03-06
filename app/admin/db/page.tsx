// app/admin/db/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type Row = {
  userId: string;
  walletAddress: string | null;
  totalMinedEcho: number;
  totalPurchasedEcho: number;
  totalEcho: number;
  firstMiningAt: string | null;
  lastMiningAt: string | null;
  lastSessionMined: number | null;
  lastSessionEndedAt: string | null;
  createdAt: string;
};

type OverviewResponse =
  | { ok: true; count: number; rows: Row[]; generatedAt: string }
  | { ok: false; error: string };

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function AdminDbPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const res = await fetch("/api/admin/overview", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      // If not authed, the API returns 401 with WWW-Authenticate.
      // fetch() *sometimes* won't show the browser prompt. We'll show a UI button instead.
      if (res.status === 401) {
        const txt = await res.text().catch(() => "");
        setErr(txt || "Not logged in");
        setRows([]);
        setGeneratedAt(null);
        return;
      }

      const data = (await res.json()) as OverviewResponse;
      if (!data || data.ok !== true) {
        setErr((data as any)?.error || "Admin overview failed");
        setRows([]);
        setGeneratedAt(null);
        return;
      }

      setRows(data.rows);
      setGeneratedAt(data.generatedAt);
    } catch (e: any) {
      setErr(e?.message || "Admin overview failed");
      setRows([]);
      setGeneratedAt(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!mounted) return;
      await load();
    })();

    const interval = setInterval(() => {
      load();
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const totals = useMemo(() => {
    const totalUsers = rows.length;
    const mined = rows.reduce((a, r) => a + (r.totalMinedEcho || 0), 0);
    const purchased = rows.reduce((a, r) => a + (r.totalPurchasedEcho || 0), 0);
    const totalEcho = rows.reduce((a, r) => a + (r.totalEcho || 0), 0);
    return { totalUsers, mined, purchased, totalEcho };
  }, [rows]);

  return (
    <div className="min-h-screen bg-background text-white px-5 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Admin DB</h1>
            <p className="text-white/50 text-sm">
              {generatedAt ? <>Last updated: <span className="font-mono">{fmtDate(generatedAt)}</span></> : "—"}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => load()}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 font-bold text-sm"
            >
              Refresh
            </button>

            {/* This reliably triggers the browser Basic Auth prompt */}
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

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/50 font-black">Users</div>
            <div className="text-xl font-black">{totals.totalUsers}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/50 font-black">Total Mined</div>
            <div className="text-xl font-black">{fmt(totals.mined)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/50 font-black">Total Purchased</div>
            <div className="text-xl font-black">{fmt(totals.purchased)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/50 font-black">Total Echo</div>
            <div className="text-xl font-black">{fmt(totals.totalEcho)}</div>
          </div>
        </div>

        {/* Error */}
        {err && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <div className="font-black text-red-200">Admin overview failed</div>
            <div className="text-sm text-red-100/80 mt-1 break-words">{err}</div>
            <div className="text-xs text-red-100/60 mt-3">
              Tap <b>Authenticate</b> to trigger the admin login prompt.
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="font-black tracking-tight">Users</div>
            {loading && <div className="text-white/50 text-xs font-mono">loading…</div>}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-white/[0.03]">
                <tr className="text-left">
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Wallet</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Purchased</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Mined</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Total</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">First session</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Most recent</th>
                  <th className="px-4 py-3 text-white/60 font-black text-[10px] uppercase tracking-widest">Last session mined</th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-white/50" colSpan={7}>
                      No rows (or not authenticated yet).
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.userId} className="border-t border-white/5">
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.walletAddress ? (
                          <span className="text-white">{r.walletAddress}</span>
                        ) : (
                          <span className="text-white/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-black tabular-nums">{fmt(r.totalPurchasedEcho || 0)}</td>
                      <td className="px-4 py-3 font-black tabular-nums">{fmt(r.totalMinedEcho || 0)}</td>
                      <td className="px-4 py-3 font-black tabular-nums">{fmt(r.totalEcho || 0)}</td>
                      <td className="px-4 py-3 text-white/70">{fmtDate(r.firstMiningAt)}</td>
                      <td className="px-4 py-3 text-white/70">{fmtDate(r.lastMiningAt)}</td>
                      <td className="px-4 py-3 font-black tabular-nums">
                        {r.lastSessionMined == null ? <span className="text-white/40">—</span> : fmt(r.lastSessionMined)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-white/10 text-[11px] text-white/40">
            Polling every 5s. Purchases currently redacted (0) until you add the Purchase model + migration.
          </div>
        </div>
      </div>
    </div>
  );
}