// app/admin/db/page.tsx
"use client";

import React, { useEffect, useState } from "react";

type Row = {
  userId: string;
  walletAddress: string | null;
  walletVerified: boolean;
  totalMinedEcho: number;
  firstSeen: string;
  activeSession: boolean;
  lastSessionStart: string | null;
  lastSessionEnd: string | null;
};

export default function AdminDbPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // login state
  const [needLogin, setNeedLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    setNeedLogin(false);

    const res = await fetch("/api/admin/overview", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      setNeedLogin(true);
      setLoading(false);
      return;
    }

    if (!res.ok) {
      setError(data?.error || "Admin overview failed");
      setLoading(false);
      return;
    }

    setRows(data.rows || []);
    setLoading(false);
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error || "Login failed");
      return;
    }

    await load();
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="p-6 text-white/70 font-mono">Loading admin…</div>;
  }

  if (needLogin) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <form onSubmit={login} className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="text-lg font-black">Admin Login</div>

          <input
            className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-2"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <input
            className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-2"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
          />

          {error && <div className="text-red-300 text-sm">{error}</div>}

          <button className="w-full rounded-xl bg-white text-black font-black py-2">Sign in</button>
        </form>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-white">
        <div className="font-black mb-2">Admin overview failed</div>
        <div className="text-white/60 mb-4">{error}</div>
        <button className="px-4 py-2 rounded-xl bg-white/10" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xl font-black">Admin DB</div>
        <button className="px-3 py-2 rounded-xl bg-white/10" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="overflow-auto border border-white/10 rounded-2xl">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr className="text-left">
              <th className="p-3">Wallet</th>
              <th className="p-3">Verified</th>
              <th className="p-3">Total Mined</th>
              <th className="p-3">Active</th>
              <th className="p-3">Last Session</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-t border-white/10">
                <td className="p-3 font-mono text-xs">{r.walletAddress ?? "—"}</td>
                <td className="p-3">{r.walletVerified ? "✅" : "—"}</td>
                <td className="p-3">{Number(r.totalMinedEcho || 0).toFixed(6)}</td>
                <td className="p-3">{r.activeSession ? "⛏️" : "—"}</td>
                <td className="p-3 text-xs text-white/70">
                  {r.lastSessionStart ? `${new Date(r.lastSessionStart).toLocaleString()} → ${r.lastSessionEnd ? new Date(r.lastSessionEnd).toLocaleString() : "…"}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}