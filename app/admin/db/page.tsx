"use client";

import React, { useMemo, useState } from "react";

type DbResponse = {
  ok: boolean;
  error?: string;
  summary?: {
    users: number;
    wallets: number;
    sessions: number;
    miningSessions: number;
    miningHistoryCount: number;
  };
  users?: any[];
  wallets?: any[];
  sessions?: any[];
  miningSessions?: any[];
};

export default function AdminDbPage() {
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DbResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pretty = useMemo(() => (data ? JSON.stringify(data, null, 2) : ""), [data]);

  async function load() {
    setErr(null);
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(`/api/admin/db?secret=${encodeURIComponent(secret)}`);
      const json = (await res.json()) as DbResponse;
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6">
      <h1 className="text-2xl font-black mb-2">Admin DB Viewer</h1>
      <p className="text-sm text-white/60 mb-6">
        Enter your ADMIN_SECRET to load recent rows from Postgres (via Prisma).
      </p>

      <div className="flex flex-col gap-3 max-w-xl">
        <input
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white"
          placeholder="ADMIN_SECRET"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
        <button
          className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 font-bold"
          onClick={load}
          disabled={loading || !secret}
        >
          {loading ? "Loading…" : "Load Database"}
        </button>
        {err && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
            {err}
          </div>
        )}
      </div>

      {data?.summary && (
        <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Users" value={data.summary.users} />
          <Stat label="Wallets" value={data.summary.wallets} />
          <Stat label="Sessions" value={data.summary.sessions} />
          <Stat label="Mining Sessions" value={data.summary.miningSessions} />
          <Stat label="History rows" value={data.summary.miningHistoryCount} />
        </div>
      )}

      {data && (
        <pre className="mt-6 p-4 rounded-xl bg-black/30 border border-white/10 overflow-auto text-xs">
          {pretty}
        </pre>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="text-[10px] uppercase tracking-widest text-white/50 font-black">{label}</div>
      <div className="text-xl font-black mt-1">{value}</div>
    </div>
  );
}