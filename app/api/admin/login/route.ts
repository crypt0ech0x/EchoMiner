// app/api/admin/login/route.ts
import { NextResponse } from "next/server";
import { setAdminCookie } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { username?: string; password?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const u = (body.username ?? "").trim();
    const p = (body.password ?? "").trim();

    const ADMIN_USER = process.env.ADMIN_USER ?? "";
    const ADMIN_PASS = process.env.ADMIN_PASS ?? "";

    if (!ADMIN_USER || !ADMIN_PASS) {
      return NextResponse.json({ ok: false, error: "Admin env not set" }, { status: 500 });
    }

    if (u !== ADMIN_USER || p !== ADMIN_PASS) {
      return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
    }

    await setAdminCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin/login error:", err);
    return NextResponse.json({ ok: false, error: "Login failed" }, { status: 500 });
  }
}