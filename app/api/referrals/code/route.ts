// app/api/referrals/code/route.ts
import { NextResponse } from "next/server";
import { getUserFromSessionCookie } from "@/lib/auth";
import { ensureReferralCode } from "@/lib/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUserFromSessionCookie();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const code = await ensureReferralCode(user.id);
  return NextResponse.json({ ok: true, code });
}