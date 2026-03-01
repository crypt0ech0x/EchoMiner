"use client";

import React, { useEffect, useState } from "react";

type OverviewRow = {
  walletAddress: string | null;
  totalMinedEcho: number;
  totalPurchasedEcho: number; // redacted for now, keep as 0
  totalEcho: number;
  firstMineAt: string | null;
  lastMineAt: string | null;
};

type OverviewResponse = {
  ok: boolean;
  rows: OverviewRow[];
};

export default function AdminDbPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setErr(null);
        const res = await fetch("/api/admin/overview", { cache: "no-store" });
        const text = await res.text();
        const json = text ? JSON.parse(text) : null;

        if (!res.ok) throw new Error(json?.error || `${res.status}`);
        if (!mounted) return;
        setData(json);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || "Admin overview failed");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (err) {
    return (
      <div className="p-6 text-white">
        <div className="font-black mb-2">Admin overview failed</div>
        <div className="opacity-70 mb-4">{err}</div>
        <button
          className="px-4 py-2 rounded bg-white/10"
          onClick={() => location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return <div className="p-6 text-white/60">Loading…</div>;

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-black mb-4">DB Overview</h1>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-white/70">
            <tr>
              <th className="text-left p-3">Wallet</th>
              <th className="text-right p-3">Mined</th>
              <th className="text-right p-3">Purchased</th>
              <th className="text-right p-3">Total</th>
              <th className="text-left p-3">First Mine</th>
              <th className="text-left p-3">Last Mine</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i} className="border-t border-white/10">
                <td className="p-3 font-mono text-xs">
                  {r.walletAddress ?? "—"}
                </td>
                <td className="p-3 text-right tabular-nums">{r.totalMinedEcho.toFixed(6)}</td>
                <td className="p-3 text-right tabular-nums">{r.totalPurchasedEcho.toFixed(6)}</td>
                <td className="p-3 text-right tabular-nums">{r.totalEcho.toFixed(6)}</td>
                <td className="p-3 text-xs opacity-80">{r.firstMineAt ?? "—"}</td>
                <td className="p-3 text-xs opacity-80">{r.lastMineAt ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs opacity-60 mt-4">
        Purchases are currently redacted (0) until you add the Purchase model + migration.
      </p>
    </div>
  );
}