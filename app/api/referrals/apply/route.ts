// app/api/referrals/apply/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  referralCode?: string;
};

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const referralCode = String(body.referralCode ?? "").trim();

    if (!referralCode) {
      return NextResponse.json(
        { ok: false, error: "Referral code is required" },
        { status: 400 }
      );
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        referralCode: true,
        referredByUserId: true,
      },
    });

    if (!currentUser) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 }
      );
    }

    if (currentUser.referredByUserId) {
      return NextResponse.json(
        { ok: false, error: "Referral already applied" },
        { status: 409 }
      );
    }

    const referrer = await prisma.user.findUnique({
      where: { referralCode },
      select: {
        id: true,
        referralCode: true,
      },
    });

    if (!referrer) {
      return NextResponse.json(
        { ok: false, error: "Invalid referral code" },
        { status: 404 }
      );
    }

    if (referrer.id === currentUser.id) {
      return NextResponse.json(
        { ok: false, error: "You cannot use your own referral code" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        referredByUserId: referrer.id,
      },
    });

    return NextResponse.json({
      ok: true,
      referralCode,
      referredByUserId: referrer.id,
    });
  } catch (err: any) {
    console.error("referrals/apply error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to apply referral" },
      { status: 500 }
    );
  }
}