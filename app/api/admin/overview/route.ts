// app/api/admin/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

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
    return {
      user: decoded.slice(0, idx),
      pass: decoded.slice(idx + 1),
    };
  } catch {
    return null;
  }
}

function isAuthed(req: NextRequest) {
  const creds = parseBasicAuth(req);
  const ADMIN_USER = process.env.ADMIN_USER || "";
  const ADMIN_PASS = process.env.ADMIN_PASS || "";
  return !!creds && creds.user === ADMIN_USER && creds.pass === ADMIN_PASS;
}

function toIso(d: Date | null | undefined) {
  return d ? d.toISOString() : null;
}

export async function GET(req: NextRequest) {
  try {
    const redirect = req.nextUrl.searchParams.get("redirect");

    if (!isAuthed(req)) return unauthorized();

    if (redirect) {
      return NextResponse.redirect(new URL(redirect, req.url));
    }

    const now = Date.now();

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

        const ms = u.miningSession;
        const startedAtMs = ms?.startedAt ? new Date(ms.startedAt).getTime() : null;
        const endsAtMs = startedAtMs ? startedAtMs + SESSION_DURATION_MS : null;

        // ✅ derive "real" activity from time window, not just the DB flag
        const sessionIsActive =
          !!ms?.isActive &&
          startedAtMs != null &&
          endsAtMs != null &&
          now < endsAtMs;

        const totalMinedEcho = Number(u.totalMinedEcho ?? 0);
        const totalPurchasedEcho = 0; // purchases redacted for now
        const totalEcho = totalMinedEcho + totalPurchasedEcho;

        const baseRatePerHr = Number(ms?.baseRatePerHr ?? 0);
        const multiplier = Number(ms?.multiplier ?? 1);
        const effectiveRatePerSec =
          sessionIsActive && baseRatePerHr > 0 ? (baseRatePerHr * multiplier) / 3600 : 0;

        return {
          userId: u.id,
          walletAddress: u.wallet?.address ?? null,
          walletVerified: !!u.wallet?.verified,
          walletVerifiedAt: toIso(u.wallet?.verifiedAt),

          totalMinedEcho,
          totalPurchasedEcho,
          totalEcho,

          sessionIsActive,
          sessionStartedAt: toIso(ms?.startedAt),
          sessionEndsAt: endsAtMs ? new Date(endsAtMs).toISOString() : null,
          sessionLastAccruedAt: toIso(ms?.lastAccruedAt),
          sessionMined: sessionIsActive ? Number(ms?.sessionMined ?? 0) : 0,
          baseRatePerHr: sessionIsActive ? baseRatePerHr : 0,
          multiplier: sessionIsActive ? multiplier : 1,
          effectiveRatePerSec,

          firstMiningAt: toIso(firstMine?.startedAt),
          lastMiningAt: toIso(lastMine?.startedAt),
          lastSessionEndedAt: toIso(lastMine?.endedAt),
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