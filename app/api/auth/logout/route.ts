// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { revokeSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await revokeSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("logout error:", err);
    return NextResponse.json({ ok: false, error: "Logout failed" }, { status: 500 });
  }
}

// Optional: allow hitting it in browser to test quickly
export async function GET() {
  return POST();
}