// app/admin/db/page.tsx
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function AdminDbPage() {
  // You can add auth gating later (admin-only).
  const users = await prisma.user.findMany({
    include: {
      wallet: true,
      purchases: { select: { echoAmount: true } },
      miningHistory: {
        select: { startedAt: true, endedAt: true },
        orderBy: { startedAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const rows = users.map((u) => {
    const totalPurchased =
      u.totalPurchasedEcho ??
      u.purchases.reduce((sum, p) => sum + (p.echoAmount ?? 0), 0);

    const totalMined = u.totalMinedEcho ?? 0;
    const total = totalMined + totalPurchased;

    const firstMining = u.miningHistory.length ? u.miningHistory[0].startedAt : null;
    const lastMining = u.miningHistory.length ? u.miningHistory[u.miningHistory.length - 1].endedAt : null;

    return {
      id: u.id,
      wallet: u.wallet?.address ?? "—",
      mined: totalMined,
      purchased: totalPurchased,
      total,
      firstMining,
      lastMining,
    };
  });

  return (
    <div className="min-h-screen bg-[#050816] text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Admin • Database</h1>
            <p className="text-white/50 text-sm">
              Wallet + totals (mined/purchased/total). Showing newest 200 users.
            </p>
          </div>
          <div className="text-xs text-white/40">
            Tip: bookmark <span className="font-mono text-white/70">/admin/db</span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/60">
                <tr>
                  <th className="text-left p-4 font-bold">Wallet</th>
                  <th className="text-right p-4 font-bold">Purchased</th>
                  <th className="text-right p-4 font-bold">Mined</th>
                  <th className="text-right p-4 font-bold">Total</th>
                  <th className="text-left p-4 font-bold">First Mining</th>
                  <th className="text-left p-4 font-bold">Most Recent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-white/10 hover:bg-white/[0.06]">
                    <td className="p-4 font-mono text-xs text-white/80">
                      {r.wallet}
                    </td>
                    <td className="p-4 text-right font-black text-emerald-300 tabular-nums">
                      {fmt(r.purchased)}
                    </td>
                    <td className="p-4 text-right font-black text-sky-300 tabular-nums">
                      {fmt(r.mined)}
                    </td>
                    <td className="p-4 text-right font-black text-white tabular-nums">
                      {fmt(r.total)}
                    </td>
                    <td className="p-4 text-white/60">
                      {r.firstMining ? new Date(r.firstMining).toLocaleString() : "—"}
                    </td>
                    <td className="p-4 text-white/60">
                      {r.lastMining ? new Date(r.lastMining).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td className="p-6 text-white/50" colSpan={6}>
                      No users yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-xs text-white/40">
          Totals logic:
          <span className="font-mono text-white/70"> total = totalMinedEcho + totalPurchasedEcho</span>
        </div>
      </div>
    </div>
  );
}