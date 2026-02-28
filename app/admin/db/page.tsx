// app/admin/db/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type DbPayload = {
  ok: boolean;
  tables: Record<string, any[]>;
};

function fmt(v: any) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString();
  // handle Prisma dates serialized as strings
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function isLikelyDateString(s: string) {
  return /^\d{4}-\d{2}-\d{2}T/.test(s);
}

function prettyCell(v: any) {
  if (typeof v === "string" && isLikelyDateString(v)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleString();
  }
  return fmt(v);
}

export default function AdminDbPage() {
  const [data, setData] = useState<DbPayload | null>(null);
  const [active, setActive] = useState<string>("users");
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/db", { method: "GET" });
      if (!res.ok) {
        // Basic auth will prompt automatically in most browsers once it gets 401
        throw new Error(`Request failed (${res.status})`);
      }
      const json = (await res.json()) as DbPayload;
      if (!json?.ok) throw new Error("Bad response");
      setData(json);
      const keys = Object.keys(json.tables ?? {});
      if (keys.length && !keys.includes(active)) setActive(keys[0]);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tableNames = useMemo(() => Object.keys(data?.tables ?? {}), [data]);
  const rows = useMemo(() => (data?.tables?.[active] ?? []), [data, active]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(needle));
  }, [rows, q]);

  const columns = useMemo(() => {
    const first = filtered[0] ?? rows[0];
    if (!first) return [];
    return Object.keys(first);
  }, [filtered, rows]);

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black tracking-tight">Admin • Database</h1>
          <p className="text-white/50 text-sm">
            Read-only view of latest rows (limit 200 per table).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={load}
            className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-sm font-bold"
          >
            Refresh
          </button>

          <div className="flex-1 min-w-[240px]">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search in current table…"
              className="w-full h-10 px-4 rounded-xl bg-white/5 border border-white/10 outline-none text-sm"
            />
          </div>
        </div>

        {loading && (
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 animate-pulse">
            Loading…
          </div>
        )}

        {err && (
          <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-200">
            {err}
          </div>
        )}

        {!!tableNames.length && (
          <div className="flex flex-wrap gap-2">
            {tableNames.map((name) => {
              const on = name === active;
              return (
                <button
                  key={name}
                  onClick={() => setActive(name)}
                  className={`h-9 px-3 rounded-xl border text-xs font-black uppercase tracking-wider ${
                    on
                      ? "bg-teal-400/20 border-teal-400/30 text-teal-200"
                      : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {name} <span className="opacity-60">({(data?.tables?.[name] ?? []).length})</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
            <div className="font-black tracking-tight">{active}</div>
            <div className="text-xs text-white/50">
              Showing {filtered.length} row(s)
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-6 text-white/50">No rows.</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-[#060a1b]">
                  <tr>
                    {columns.map((c) => (
                      <th
                        key={c}
                        className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-white/50 border-b border-white/10"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => (
                    <tr key={idx} className="odd:bg-white/[0.02]">
                      {columns.map((c) => (
                        <td key={c} className="px-4 py-3 border-b border-white/5 text-white/80">
                          <div className="max-w-[420px] truncate">
                            {prettyCell(r?.[c])}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-xs text-white/40">
          Tip: If you want “pretty” nested objects (like user.wallet), we can render expandable rows.
        </div>
      </div>
    </div>
  );
}