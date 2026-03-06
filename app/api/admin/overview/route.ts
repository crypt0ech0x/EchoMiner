// app/api/admin/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function unauthorized() {
  // This header is what triggers the browser login prompt for Basic Auth.
  return new NextResponse(JSON.stringify({ ok: false, error: "Not logged in" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Basic realm="EchoMiner Admin", charset="UTF-8"',
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
  const u = process.env.ADMIN_USER || "";
  const p = process.env.ADMIN_PASS || "";
  if (!u || !p) {
    // If you prefer hard-fail when envs are missing, return false here.
    // But this makes it obvious why it isn't working:
    return false;
  }
  return !!creds && creds.user === u && creds.pass === p;
}

/**
 * What we return (clean + minimal):
 * - wallet address
 * - total mined echo
 * - total purchased echo (redacted for now => 0)
 * - total echo
 * - first mining session time
 * - most recent mining session time
 */
export async function GET(req: NextRequest) {
  try {
    // Optional: support redirect bootstrap to trigger login prompt in the browser.
    // Example: /api/admin/overview?redirect=/admin/db
    const redirect = req.nextUrl.searchParams.get("redirect");

    if (!isAuthed(req)) return unauthorized();

    if (redirect) {
      // Once authed, bounce back to the admin page
      return NextResponse.redirect(new URL(redirect, req.url));
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        wallet: true,
      },
    });

    // Pull mining history in a way that works even if users have none yet.
    // We do 2 lightweight queries per user (first + latest). Fine for admin.
    const rows = await Promise.all(
      users.map(async (u) => {
        const walletAddress = u.wallet?.address ?? null;

        const latest = await prisma.miningHistory.findFirst({
          where: { userId: u.id },
          orderBy: { startedAt: "desc" },
          select: { startedAt: true, endedAt: true, totalMined: true },
        });

        const first = await prisma.miningHistory.findFirst({
          where: { userId: u.id },
          orderBy: { startedAt: "asc" },
          select: { startedAt: true },
        });

        const totalMinedEcho = Number(u.totalMinedEcho ?? 0);

        // Purchases are redacted for now
        const totalPurchasedEcho = 0;

        const totalEcho = totalMinedEcho + totalPurchasedEcho;

        return {
          userId: u.id,
          walletAddress,
          totalMinedEcho,
          totalPurchasedEcho,
          totalEcho,
          firstMiningAt: first?.startedAt ? first.startedAt.toISOString() : null,
          lastMiningAt: latest?.startedAt ? latest.startedAt.toISOString() : null,
          lastSessionMined: latest?.totalMined != null ? Number(latest.totalMined) : null,
          lastSessionEndedAt: latest?.endedAt ? latest.endedAt.toISOString() : null,
          createdAt: u.createdAt.toISOString(),
        };
      })
    );

    return json({
      ok: true,
      count: rows.length,
      rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("admin/overview error:", err);
    return json({ ok: false, error: "Admin overview failed" }, 500);
  }
}