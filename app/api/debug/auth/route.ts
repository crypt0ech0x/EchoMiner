// app/api/debug/auth/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "echo_session";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(COOKIE_NAME)?.value ?? null;

    let session = null;
    if (sessionId) {
      try {
        session = await prisma.session.findUnique({
          where: { id: sessionId },
          include: {
            user: {
              include: {
                wallet: true,
              },
            },
          },
        });
      } catch (err: any) {
        return NextResponse.json({
          ok: false,
          cookiePresent: !!sessionId,
          sessionId,
          prismaError: err?.message ?? "Unknown Prisma error",
        });
      }
    }

    const authedUser = await getUserFromSessionCookie();

    return NextResponse.json({
      ok: true,
      cookiePresent: !!sessionId,
      sessionId,
      sessionFound: !!session,
      sessionRevokedAt: session?.revokedAt?.toISOString?.() ?? null,
      sessionExpiresAt: session?.expiresAt?.toISOString?.() ?? null,
      userIdFromSession: session?.userId ?? null,
      walletFromSession: session?.user?.wallet?.address ?? null,
      authedUserId: authedUser?.id ?? null,
      authedWallet: authedUser?.wallet?.address ?? null,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Debug route failed",
      },
      { status: 500 }
    );
  }
}