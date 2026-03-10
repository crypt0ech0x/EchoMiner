// app/api/referrals/apply/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  code?: string;
};

export async function POST(req: Request) {
  const user = await getUserFromSessionCookie();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const code = String(body.code ?? "").trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
  }

  const referrer = await prisma.user.findFirst({
    where: { referralCode: code },
    select: { id: true },
  });

  if (!referrer) {
    return NextResponse.json({ ok: false, error: "Invalid referral code" }, { status: 404 });
  }

  if (referrer.id === user.id) {
    return NextResponse.json({ ok: false, error: "Cannot refer yourself" }, { status: 400 });
  }

  const existing = await prisma.referral.findUnique({
    where: { referredUserId: user.id },
  });

  if (existing) {
    return NextResponse.json({ ok: false, error: "Referral already applied" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { referredByUserId: referrer.id },
    });

    await tx.referral.create({
      data: {
        referrerUserId: referrer.id,
        referredUserId: user.id,
        status: "pending",
      },
    });
  });

  return NextResponse.json({ ok: true });
}