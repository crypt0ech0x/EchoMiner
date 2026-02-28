// app/api/admin/db/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin DB"' },
  });
}

function parseBasicAuth(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return null;
  const b64 = auth.slice("Basic ".length);
  const [user, pass] = Buffer.from(b64, "base64").toString("utf8").split(":");
  return { user, pass };
}

export async function GET(req: Request) {
  const creds = parseBasicAuth(req);
  if (
    !creds ||
    creds.user !== process.env.ADMIN_USER ||
    creds.pass !== process.env.ADMIN_PASS
  ) {
    return unauthorized();
  }

  // Pull useful “tables” (customize as needed)
  const [users, wallets, miningSessions, miningHistory, sessions] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { wallet: true },
    }),
    prisma.wallet.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
    prisma.miningSession.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
    prisma.miningHistory.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.session.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  return NextResponse.json({
    ok: true,
    tables: {
      users,
      wallets,
      miningSessions,
      miningHistory,
      sessions,
    },
  });
}