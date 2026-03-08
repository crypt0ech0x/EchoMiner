// app/admin/db/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  wallet: string;
  verified: boolean;
  verifiedAt: string | null;

  previousTotal: number;
  liveTotal: number;

  sessionActive: boolean;
  liveSessionMined: number;
  baseRatePerHr: number;
  multiplier: number;
  startedAt: string | null;
  lastAccruedAt: string | null;
  endsAt: string | null;
};

type Totals = {
  wallets: number;
  activeSessions: number;
  previousTotal: number;
  liveTotal: number;
};

function fmtNum(n: number, digits = 4) {
  return Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function shortWallet(address: string) {
  if (!address) return "—";
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function AdminDbPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals>({
    wallets: 0,
    activeSessions: 0,
    previousTotal: 0,
    liveTotal: 0,
  });
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/admin/analytics", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
  });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Admin overview failed");
      }

      setErr(null);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotals(
        data.totals ?? {
          wallets: 0,
          activeSessions: 0,
          previousTotal: 0,
          liveTotal: 0,
        }
      );
      setGeneratedAt(data.generatedAt ?? null);
    } catch (e: any) {
      setErr(e?.message || "Admin overview failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.sessionActive && !b.sessionActive) return -1;
      if (!a.sessionActive && b.sessionActive) return 1;
      return b.liveTotal - a.liveTotal;
    });
  }, [rows]);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Admin DB</h1>
            <p className="text-sm text-white/50 mt-1">
              Live wallet and mining overview
            </p>
          </div>

          <button
            onClick={load}
            className="px-4 py-2 rounded-xl bg-white text-black font-bold"
          >
            Refresh
          </button>
        </div>

        {err && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
            {err}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-widest text-white/40 font-black">
              Wallets
            </div>
            <div className="mt-2 text-2xl font-black">{totals.wallets}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-widest text-white/40 font-black">
              Active Sessions
            </div>
            <div className="mt-2 text-2xl font-black">{totals.activeSessions}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-widest text-white/40 font-black">
              Previous Total
            </div>
            <div className="mt-2 text-2xl font-black">
              {fmtNum(totals.previousTotal)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-widest text-white/40 font-black">
              Live Total
            </div>
            <div className="mt-2 text-2xl font-black">
              {fmtNum(totals.liveTotal)}
            </div>
          </div>
        </div>

        <div className="text-xs text-white/35">
          {loading ? "Loading..." : `Generated at: ${fmtDate(generatedAt)}`}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-white/50">
                <th className="p-4 font-black">Wallet</th>
                <th className="p-4 font-black">Verified</th>
                <th className="p-4 font-black">Previous Total</th>
                <th className="p-4 font-black">Live Session</th>
                <th className="p-4 font-black">Live Total</th>
                <th className="p-4 font-black">Rate</th>
                <th className="p-4 font-black">Started</th>
                <th className="p-4 font-black">Ends</th>
              </tr>
            </thead>

            <tbody>
              {sortedRows.map((row) => (
                <tr
                  key={row.wallet}
                  className="border-t border-white/10 hover:bg-white/5"
                >
                  <td className="p-4 font-mono" title={row.wallet}>
                    {shortWallet(row.wallet)}
                  </td>

                  <td className="p-4">
                    <span
                      className={
                        row.verified
                          ? "text-emerald-300 font-bold"
                          : "text-white/40 font-bold"
                      }
                    >
                      {row.verified ? "Yes" : "No"}
                    </span>
                  </td>

                  <td className="p-4 font-bold">{fmtNum(row.previousTotal)}</td>

                  <td className="p-4">
                    {row.sessionActive ? (
                      <div>
                        <div className="text-emerald-300 font-bold">
                          {fmtNum(row.liveSessionMined)}
                        </div>
                        <div className="text-xs text-white/35">Active</div>
                      </div>
                    ) : (
                      <span className="text-white/35">—</span>
                    )}
                  </td>

                  <td className="p-4 font-bold">{fmtNum(row.liveTotal)}</td>

                  <td className="p-4">
                    {row.sessionActive ? (
                      <div>
                        <div>{fmtNum(row.baseRatePerHr, 4)} E/H</div>
                        <div className="text-xs text-white/35">
                          x{fmtNum(row.multiplier, 2)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-white/35">—</span>
                    )}
                  </td>

                  <td className="p-4">{fmtDate(row.startedAt)}</td>
                  <td className="p-4">{fmtDate(row.endsAt)}</td>
                </tr>
              ))}

              {!sortedRows.length && !loading && (
                <tr>
                  <td className="p-6 text-white/40" colSpan={8}>
                    No wallets found.
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