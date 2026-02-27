// app/admin/db/page.tsx
import { prisma } from "@/lib/prisma";

// Simple protection:
// Set ADMIN_KEY in Vercel env vars, then visit: /admin/db?key=YOUR_ADMIN_KEY
export default async function AdminDbPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const required = process.env.ADMIN_KEY;

  if (required && searchParams.key !== required) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Unauthorized</h1>
        <p style={{ marginTop: 8 }}>
          Add <code>?key=...</code> to the URL (must match <code>ADMIN_KEY</code>).
        </p>
      </div>
    );
  }

  // Pull a little bit of data from each table (customize as you like)
  const [
    userCount,
    walletCount,
    miningSessionCount,
    miningHistoryCount,
    sessionCount,

    users,
    wallets,
    miningSessions,
    miningHistory,
    sessions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.wallet.count(),
    prisma.miningSession.count(),
    prisma.miningHistory.count(),
    prisma.session.count(),

    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { wallet: true, miningSession: true },
    }),
    prisma.wallet.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.miningSession.findMany({ orderBy: { updatedAt: "desc" }, take: 25 }),
    prisma.miningHistory.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.session.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
  ]);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12 }}>DB Admin</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Badge label="Users" value={userCount} />
        <Badge label="Wallets" value={walletCount} />
        <Badge label="MiningSession" value={miningSessionCount} />
        <Badge label="MiningHistory" value={miningHistoryCount} />
        <Badge label="Sessions" value={sessionCount} />
      </div>

      <Section title="Wallets (latest 25)">
        <Table
          columns={["createdAt", "address", "verified", "verifiedAt", "userId"]}
          rows={wallets.map((w) => ({
            createdAt: fmt(w.createdAt),
            address: w.address,
            verified: String(w.verified),
            verifiedAt: w.verifiedAt ? fmt(w.verifiedAt) : "",
            userId: w.userId ?? "",
          }))}
        />
      </Section>

      <Section title="Users (latest 25)">
        <Table
          columns={["createdAt", "id", "email", "totalMinedEcho", "walletAddress", "walletVerified"]}
          rows={users.map((u) => ({
            createdAt: fmt(u.createdAt),
            id: u.id,
            email: u.email ?? "",
            totalMinedEcho: String(u.totalMinedEcho ?? 0),
            walletAddress: u.wallet?.address ?? "",
            walletVerified: String(u.wallet?.verified ?? false),
          }))}
        />
      </Section>

      <Section title="MiningSession (latest 25)">
        <Table
          columns={[
            "updatedAt",
            "userId",
            "isActive",
            "startedAt",
            "lastAccruedAt",
            "baseRatePerHr",
            "multiplier",
            "sessionMined",
          ]}
          rows={miningSessions.map((s) => ({
            updatedAt: fmt(s.updatedAt),
            userId: s.userId,
            isActive: String(s.isActive),
            startedAt: s.startedAt ? fmt(s.startedAt) : "",
            lastAccruedAt: s.lastAccruedAt ? fmt(s.lastAccruedAt) : "",
            baseRatePerHr: String(s.baseRatePerHr),
            multiplier: String(s.multiplier),
            sessionMined: String(s.sessionMined),
          }))}
        />
      </Section>

      <Section title="MiningHistory (latest 25)">
        <Table
          columns={["createdAt", "userId", "startedAt", "endedAt", "baseRatePerHr", "multiplier", "totalMined"]}
          rows={miningHistory.map((h) => ({
            createdAt: fmt(h.createdAt),
            userId: h.userId,
            startedAt: fmt(h.startedAt),
            endedAt: fmt(h.endedAt),
            baseRatePerHr: String(h.baseRatePerHr),
            multiplier: String(h.multiplier),
            totalMined: String(h.totalMined),
          }))}
        />
      </Section>

      <Section title="Sessions (latest 25)">
        <Table
          columns={["createdAt", "id", "userId", "expiresAt", "revokedAt"]}
          rows={sessions.map((s) => ({
            createdAt: fmt(s.createdAt),
            id: s.id,
            userId: s.userId,
            expiresAt: fmt(s.expiresAt),
            revokedAt: s.revokedAt ? fmt(s.revokedAt) : "",
          }))}
        />
      </Section>

      <p style={{ marginTop: 24, opacity: 0.7, fontSize: 12 }}>
        Tip: remove this page or protect it more strongly before going public.
      </p>
    </div>
  );
}

function Badge({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        background: "rgba(255,255,255,0.04)",
        color: "white",
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>{title}</h2>
      {children}
    </div>
  );
}

function Table({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Record<string, string>>;
}) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  fontSize: 12,
                  opacity: 0.8,
                  borderBottom: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  whiteSpace: "nowrap",
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td style={{ padding: 12, opacity: 0.7 }} colSpan={columns.length}>
                No rows yet.
              </td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={idx}>
                {columns.map((c) => (
                  <td
                    key={c}
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function fmt(d: Date) {
  // nice-ish readable
  return new Date(d).toISOString().replace("T", " ").replace("Z", "Z");
}