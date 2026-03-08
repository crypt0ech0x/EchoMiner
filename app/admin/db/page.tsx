// app/admin/db/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  wallet: string;
  verified: boolean;
  createdAt: string;
  previousTotal: number;
  liveSession: number;
  liveTotal: number;
  sessionActive: boolean;
  endingSoon: boolean;
  baseRatePerHr: number;
  multiplier: number;
  startedAt: string | null;
};

type Summary = {
  totalWallets: number;
  verifiedWallets: number;
  activeSessions: number;
  previousTotal: number;
  liveSessionTotal: number;
  liveTotal: number;
  avgLivePerWallet: number;
  avgLivePerActive: number;
};

type Activity = {
  newWalletsToday: number;
  sessionsEndingSoon: number;
};

type DailyEmission = {
  date: string;
  emitted: number;
};

type AnalyticsResponse = {
  ok: boolean;
  generatedAt: string;
  summary: Summary;
  activity: Activity;
  charts: {
    dailyEmissions: DailyEmission[];
  };
  leaderboards: {
    byLiveTotal: Row[];
    byPreviousTotal: Row[];
    byLiveSession: Row[];
  };
  rows: Row[];
  error?: string;
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

function KpiCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35 font-black">
        {title}
      </div>
      <div className="mt-3 text-3xl font-black text-white tracking-tight">{value}</div>
      {subtitle ? <div className="mt-2 text-xs text-white/35">{subtitle}</div> : null}
    </div>
  );
}

function Leaderboard({
  title,
  rows,
  valueKey,
}: {
  title: string;
  rows: Row[];
  valueKey: "liveTotal" | "previousTotal" | "liveSession";
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      <div className="text-sm font-black text-white mb-4">{title}</div>

      <div className="space-y-3">
        {rows.length ? (
          rows.map((row, idx) => (
            <div
              key={`${title}-${row.wallet}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-3 py-3 border border-white/5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-xs text-white/30 font-black w-5">{idx + 1}</div>
                <div className="font-mono text-sm text-white/80 truncate">
                  {shortWallet(row.wallet)}
                </div>
              </div>

              <div className="text-sm font-black text-white whitespace-nowrap">
                {fmtNum(Number(row[valueKey] ?? 0))}
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-white/40">No data.</div>
        )}
      </div>
    </div>
  );
}

function EmissionsChart({ points }: { points: DailyEmission[] }) {
  const width = 900;
  const height = 260;
  const pad = 28;

  const maxY = Math.max(...points.map((p) => p.emitted), 1);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const barW = innerW / Math.max(points.length, 1) - 8;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-black text-white">Daily Emissions</div>
        <div className="text-xs text-white/35">Last 14 days</div>
      </div>

      <div className="overflow-x-auto">
        <svg width={width} height={height} className="min-w-[900px]">
          <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="rgba(255,255,255,0.15)" />
          {points.map((p, i) => {
            const h = (p.emitted / maxY) * (innerH - 10);
            const x = pad + i * (innerW / points.length) + 4;
            const y = height - pad - h;
            return (
              <g key={p.date}>
                <rect
                  x={x}
                  y={y}
                  width={Math.max(barW, 8)}
                  height={h}
                  rx={8}
                  fill="rgba(255,255,255,0.75)"
                />
                <text
                  x={x + Math.max(barW, 8) / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill="rgba(255,255,255,0.45)"
                >
                  {p.date.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function AdminDbPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/admin/analytics", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const json = (await res.json().catch(() => null)) as AnalyticsResponse | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Analytics failed");
      }

      setErr(null);
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Analytics failed");
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
    const rows = data?.rows ?? [];
    return [...rows].sort((a, b) => {
      if (a.sessionActive && !b.sessionActive) return -1;
      if (!a.sessionActive && b.sessionActive) return 1;
      return b.liveTotal - a.liveTotal;
    });
  }, [data?.rows]);

  return (
    <div className="min-h-screen bg-[#05070b] text-white">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">Admin Analytics</h1>
            <p className="text-sm text-white/45 mt-2">Canonical mining, emissions, and wallet overview</p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/api/admin/snapshot"
              className="px-4 py-2 rounded-2xl bg-white text-black font-bold"
            >
              Export Snapshot CSV
            </a>
            <button
              onClick={load}
              className="px-4 py-2 rounded-2xl border border-white/15 bg-white/[0.05] text-white font-bold"
            >
              Refresh
            </button>
          </div>
        </div>

        {err && (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
            {err}
          </div>
        )}

        <div className="text-xs text-white/30">
          {loading ? "Loading..." : `Generated at: ${fmtDate(data?.generatedAt ?? null)}`}
        </div>

        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <KpiCard title="Wallets" value={data.summary.totalWallets} />
              <KpiCard title="Verified Wallets" value={data.summary.verifiedWallets} />
              <KpiCard title="Active Sessions" value={data.summary.activeSessions} />
              <KpiCard title="Previous Total" value={fmtNum(data.summary.previousTotal)} />
              <KpiCard title="Live Session Total" value={fmtNum(data.summary.liveSessionTotal)} />
              <KpiCard title="Live Total" value={fmtNum(data.summary.liveTotal)} />
              <KpiCard title="New Wallets Today" value={data.activity.newWalletsToday} />
              <KpiCard title="Sessions Ending Soon" value={data.activity.sessionsEndingSoon} />
            </div>

            <EmissionsChart points={data.charts.dailyEmissions} />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <Leaderboard
                title="Top Live Total"
                rows={data.leaderboards.byLiveTotal}
                valueKey="liveTotal"
              />
              <Leaderboard
                title="Top Previous Total"
                rows={data.leaderboards.byPreviousTotal}
                valueKey="previousTotal"
              />
              <Leaderboard
                title="Top Live Session"
                rows={data.leaderboards.byLiveSession}
                valueKey="liveSession"
              />
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10">
                <div className="text-sm font-black text-white">Wallet Table</div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.03]">
                    <tr className="text-left text-white/45">
                      <th className="p-4 font-black">Wallet</th>
                      <th className="p-4 font-black">Verified</th>
                      <th className="p-4 font-black">Previous Total</th>
                      <th className="p-4 font-black">Live Session</th>
                      <th className="p-4 font-black">Live Total</th>
                      <th className="p-4 font-black">Rate</th>
                      <th className="p-4 font-black">Started</th>
                      <th className="p-4 font-black">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {sortedRows.map((row) => (
                      <tr
                        key={row.wallet}
                        className="border-t border-white/10 hover:bg-white/[0.03]"
                      >
                        <td className="p-4 font-mono" title={row.wallet}>
                          {shortWallet(row.wallet)}
                        </td>

                        <td className="p-4">
                          <span className={row.verified ? "text-emerald-300 font-bold" : "text-white/35 font-bold"}>
                            {row.verified ? "Yes" : "No"}
                          </span>
                        </td>

                        <td className="p-4 font-bold">{fmtNum(row.previousTotal)}</td>

                        <td className="p-4">
                          {row.sessionActive ? (
                            <div>
                              <div className="text-emerald-300 font-bold">
                                {fmtNum(row.liveSession)}
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

                        <td className="p-4">
                          {row.sessionActive ? (
                            <span className={row.endingSoon ? "text-yellow-300 font-bold" : "text-emerald-300 font-bold"}>
                              {row.endingSoon ? "Ending Soon" : "Active"}
                            </span>
                          ) : (
                            <span className="text-white/35">Inactive</span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {!sortedRows.length && !loading && (
                      <tr>
                        <td className="p-6 text-white/35" colSpan={8}>
                          No wallets found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}