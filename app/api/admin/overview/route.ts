// app/api/admin/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function unauthorized() {
  return new NextResponse(JSON.stringify({ ok: false, error: "Not logged in" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Basic realm="EchoMiner Admin", charset="UTF-8"',
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function parseBasicAuth(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const [type, value] = header.split(" ");
  if (type !== "Basic" || !value) return null;

  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx === -1) return null;
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    return { user, pass };
  } catch {
    return null;
  }
}

function isAuthed(req: NextRequest) {
  const creds = parseBasicAuth(req);
  const ADMIN_USER = process.env.ADMIN_USER || "";
  const ADMIN_PASS = process.env.ADMIN_PASS || "";

  if (!ADMIN_USER || !ADMIN_PASS) return false;
  return !!creds && creds.user === ADMIN_USER && creds.pass === ADMIN_PASS;
}

export async function GET(req: NextRequest) {
  try {
    const redirect = req.nextUrl.searchParams.get("redirect");

    if (!isAuthed(req)) return unauthorized();

    if (redirect) {
      return NextResponse.redirect(new URL(redirect, req.url));
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        wallet: true,
        miningSession: true,
      },
    });

    const rows = await Promise.all(
      users.map(async (u) => {
        const firstMine = await prisma.miningHistory.findFirst({
          where: { userId: u.id },
          orderBy: { startedAt: "asc" },
          select: {
            startedAt: true,
            endedAt: true,
            totalMined: true,
          },
        });

        const lastMine = await prisma.miningHistory.findFirst({
          where: { userId: u.id },
          orderBy: { startedAt: "desc" },
          select: {
            startedAt: true,
            endedAt: true,
            totalMined: true,
          },
        });

        const totalMinedEcho = Number(u.totalMinedEcho ?? 0);
        const totalPurchasedEcho = 0; // redacted for now
        const totalEcho = totalMinedEcho + totalPurchasedEcho;

        const baseRatePerHr = Number(u.miningSession?.baseRatePerHr ?? 0);
        const multiplier = Number(u.miningSession?.multiplier ?? 1);
        const effectiveRatePerSec =
          baseRatePerHr > 0 ? (baseRatePerHr * multiplier) / 3600 : 0;

        return {
          userId: u.id,
          walletAddress: u.wallet?.address ?? null,
          walletVerified: !!u.wallet?.verified,
          walletVerifiedAt: u.wallet?.verifiedAt
            ? u.wallet.verifiedAt.toISOString()
            : null,

          totalMinedEcho,
          totalPurchasedEcho,
          totalEcho,

          // live session fields
          sessionIsActive: !!u.miningSession?.isActive,
          sessionStartedAt: u.miningSession?.startedAt
            ? u.miningSession.startedAt.toISOString()
            : null,
          sessionLastAccruedAt: u.miningSession?.lastAccruedAt
            ? u.miningSession.lastAccruedAt.toISOString()
            : null,
          sessionMined: Number(u.miningSession?.sessionMined ?? 0),
          baseRatePerHr,
          multiplier,
          effectiveRatePerSec,

          firstMiningAt: firstMine?.startedAt
            ? firstMine.startedAt.toISOString()
            : null,
          lastMiningAt: lastMine?.startedAt
            ? lastMine.startedAt.toISOString()
            : null,
          lastSessionEndedAt: lastMine?.endedAt
            ? lastMine.endedAt.toISOString()
            : null,
          lastSessionMined:
            lastMine?.totalMined != null ? Number(lastMine.totalMined) : null,

          createdAt: u.createdAt.toISOString(),
        };
      })
    );

    const totals = {
      wallets: rows.length,
      activeSessions: rows.filter((r) => r.sessionIsActive).length,
      totalMinedEcho: rows.reduce((sum, r) => sum + r.totalMinedEcho, 0),
      totalPurchasedEcho: rows.reduce((sum, r) => sum + r.totalPurchasedEcho, 0),
      totalEcho: rows.reduce((sum, r) => sum + r.totalEcho, 0),
    };

    return json({
      ok: true,
      generatedAt: new Date().toISOString(),
      totals,
      rows,
    });
  } catch (err) {
    console.error("admin/overview error:", err);
    return json({ ok: false, error: "Admin overview failed" }, 500);
  }
}