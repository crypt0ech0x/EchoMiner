"use client";

import { useEffect, useState } from "react";

type Row = {
  wallet: string | null;
  totalMinedEcho: number;
  totalPurchasedEcho: number;
  totalEcho: number;
  firstSession: string | null;
  lastSession: string | null;
};

export default function AdminDBPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin/overview", {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const data = await res.json();
      setRows(data.rows || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }

  // Initial load
  useEffect(() => {
    load();
  }, []);

  // Poll every 5 seconds
  useEffect(() => {
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-10 text-white">
      <h1 className="text-2xl font-bold mb-6">EchoMiner Admin DB</h1>

      {error && (
        <div className="text-red-400 mb-6">
          Error: {error}
        </div>
      )}

      <table className="w-full border border-white/10">
        <thead>
          <tr className="bg-white/5">
            <th className="p-3 text-left">Wallet</th>
            <th className="p-3 text-left">Mined</th>
            <th className="p-3 text-left">Purchased</th>
            <th className="p-3 text-left">Total Echo</th>
            <th className="p-3 text-left">First Session</th>
            <th className="p-3 text-left">Last Session</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-white/10">
              <td className="p-3 font-mono">{r.wallet}</td>
              <td className="p-3">{r.totalMinedEcho}</td>
              <td className="p-3">{r.totalPurchasedEcho}</td>
              <td className="p-3">{r.totalEcho}</td>
              <td className="p-3">
                {r.firstSession ? new Date(r.firstSession).toLocaleString() : "-"}
              </td>
              <td className="p-3">
                {r.lastSession ? new Date(r.lastSession).toLocaleString() : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}