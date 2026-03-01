// app/admin/db/page.tsx
import React from "react";

export const dynamic = "force-dynamic";

type Row = {
  userId: string;
  walletAddress: string | null;
  walletVerified: boolean;
  totalPurchasedEcho: number;
  totalMinedEcho: number;
  totalEcho: number;
  firstMiningSession: string | null;
  mostRecentMiningSession: string | null;
};

async function getOverview(): Promise<Row[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/app/api/admin/overview`, {
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return (data?.rows ?? []) as Row[];
}

function fmtDate(s: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

export default async function AdminDbPage() {
  let rows: Row[] = [];
  let error: string | null = null;

  try {
    rows = await getOverview();
  } catch (e: any) {
    error = e?.message || "Request failed (500)";
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Admin DB</h1>
            <p className="text-white/50 text-sm">
              Wallet + Purchased + Mined + Total + First/Latest session
            </p>
          </div>
          <div className="text-xs text-white/40">
            Rows: <span className="text-white/70 font-bold">{rows.length}</span>
          </div>
        </div>

        {error ? (
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200">
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
            <table className="min-w-full text-sm">
              <thead className="text-white/60">
                <tr className="border-b border-white/10">
                  <th className="text-left p-3">Wallet</th>
                  <th className="text-left p-3">Verified</th>
                  <th className="text-right p-3">Purchased</th>
                  <th className="text-right p-3">Mined</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-left p-3">First session</th>
                  <th className="text-left p-3">Most recent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} className="border-b border-white/5 hover:bg-white/[0.04]">
                    <td className="p-3 font-mono text-xs text-white/80">
                      {r.walletAddress ? `${r.walletAddress.slice(0, 6)}…${r.walletAddress.slice(-6)}` : "-"}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-lg text-[11px] font-black border ${
                          r.walletVerified
                            ? "border-teal-400/30 bg-teal-400/10 text-teal-200"
                            : "border-white/10 bg-white/5 text-white/50"
                        }`}
                      >
                        {r.walletVerified ? "VERIFIED" : "NO"}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums">{r.totalPurchasedEcho.toFixed(4)}</td>
                    <td className="p-3 text-right tabular-nums">{r.totalMinedEcho.toFixed(4)}</td>
                    <td className="p-3 text-right tabular-nums font-black">{r.totalEcho.toFixed(4)}</td>
                    <td className="p-3 text-white/60">{fmtDate(r.firstMiningSession)}</td>
                    <td className="p-3 text-white/60">{fmtDate(r.mostRecentMiningSession)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="p-6 text-white/40" colSpan={7}>
                      No users found yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}