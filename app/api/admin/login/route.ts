// app/api/admin/login/route.ts
import { NextResponse } from "next/server";
import { createAdminSession, validateAdminCredentials } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  username?: string;
  password?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: "Missing username or password" },
        { status: 400 }
      );
    }

    if (!validateAdminCredentials(username, password)) {
      return NextResponse.json(
        { ok: false, error: "Invalid admin credentials" },
        { status: 401 }
      );
    }

    const { expiresAtMs } = await createAdminSession(username);

    return NextResponse.json({
      ok: true,
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
  } catch (err) {
    console.error("admin/login error:", err);
    return NextResponse.json(
      { ok: false, error: "Login failed" },
      { status: 500 }
    );
  }
}