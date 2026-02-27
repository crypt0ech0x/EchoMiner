import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!secret || secret !== process.env.ADMIN_SECRET) return unauthorized();

  // Keep this lightweight (don’t dump huge tables)
  const [users, wallets, sessions, miningSessions, miningHistoryCount] = await Promise.all([
    prisma.user.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: { wallet: true },
    }),
    prisma.wallet.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
    }),
    prisma.session.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
    }),
    prisma.miningSession.findMany({
      take: 50,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.miningHistory.count(),
  ]);

  return NextResponse.json({
    ok: true,
    summary: {
      users: users.length,
      wallets: wallets.length,
      sessions: sessions.length,
      miningSessions: miningSessions.length,
      miningHistoryCount,
    },
    users,
    wallets,
    sessions,
    miningSessions,
  });
}