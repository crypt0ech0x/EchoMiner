// app/api/admin/logout/route.ts
import { NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await clearAdminCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin/logout error:", err);
    return NextResponse.json({ ok: false, error: "Logout failed" }, { status: 500 });
  }
}