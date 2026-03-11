// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { revokeSessionFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await revokeSessionFromRequest(req);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("logout error:", err);
    return NextResponse.json(
      { ok: false, error: "Logout failed" },
      { status: 500 }
    );
  }
}