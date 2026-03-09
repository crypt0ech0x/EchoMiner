// app/api/store/webhook/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Stripe webhook is no longer used. Store purchases now use SOL wallet payments.",
    },
    { status: 410 }
  );
}